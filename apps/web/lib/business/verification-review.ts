// Server-only. Business verification reviews: a business with a complete
// profile submits a registration number or tax ID; a free official register
// checks it where one exists, and a reviewer decides the rest.
import { accountDb, accountTables } from "@/lib/account/db";
import { accountErrors } from "@/lib/account/errors";
import {
  businessProfileVerificationStatus,
  loadBusinessProfile,
} from "@/lib/account/service";
import type { BusinessAccountProfile } from "@/lib/account/types";
import { businessDb, businessTables } from "@/lib/business/db";
import {
  availableRegistryKeys,
  businessIdShapeError,
  decideFromRegistry,
  lookUpBusinessId,
  normalizeBusinessId,
  type RegistryDecision as Decision,
} from "@/lib/business/registry-check";
import {
  businessIdOptions,
  manualLookupSites,
  type BusinessIdType,
} from "@/lib/business/registry-sources";
import {
  missingVerificationFields,
  readReviewStatus,
  type BusinessReviewStatus,
} from "@/lib/business/verification";
import { findCountry } from "@/lib/countries";

const submissionsTable = "business_verification_submissions";
/** Free registers are shared; don't let one business hammer them. */
const maxSubmissionsPerDay = 5;

export type VerificationSubmission = {
  id: string;
  wallet_address: string;
  business_name: string;
  country_code: string;
  id_type: BusinessIdType;
  id_number: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  method: "AUTOMATIC" | "MANUAL";
  source: string | null;
  registry_name: string | null;
  registry_status: string | null;
  note: string | null;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function missingTable(error: { message?: string; code?: string } | null) {
  return Boolean(
    error && (/business_verification_submissions|review_status/.test(error.message ?? "") || error.code === "42P01"),
  );
}

const migrationMessage =
  "Business verification isn't set up yet: run packages/database/supabase/business-verification-reviews.sql.";

function profileFields(profile: BusinessAccountProfile) {
  return {
    businessName: profile.business_name,
    category: profile.category,
    contactEmail: profile.contact_email,
    country: profile.country,
    description: profile.description,
    logoUrl: profile.logo_url,
    phone: profile.phone,
    website: profile.website,
  };
}

async function latestSubmission(wallet: string) {
  const { data, error } = await accountDb()
    .from(submissionsTable)
    .select("*")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missingTable(error)) {
    // Say which half is missing, so whoever runs SwiftPay can fix it.
    console.warn(
      "[business-verification]",
      error?.code === "42501"
        ? "permission denied: run the GRANT at the end of business-verification-reviews.sql"
        : `not set up: ${error?.message}`,
    );
    return { ready: false as const, submission: null };
  }
  return { ready: true as const, submission: (data as VerificationSubmission | null) ?? null };
}

/** What the settings panel shows. */
export async function getVerificationState(wallet: string) {
  const owner = wallet.toLowerCase();
  const profile = await loadBusinessProfile(owner);
  if (!profile) throw accountErrors.profileRequired();

  const missing = missingVerificationFields(profileFields(profile));
  const country = findCountry(profile.country);
  const { ready, submission } = await latestSubmission(owner);

  return {
    ready: ready && profile.review_status !== undefined,
    eligible: missing.length === 0 && Boolean(country),
    missing,
    country: country ? { code: country.code, name: country.name } : null,
    options: businessIdOptions(country?.code, availableRegistryKeys()),
    review: readReviewStatus(profile.review_status),
    status: profile.verification_status,
    submission: submission
      ? {
          createdAt: submission.created_at,
          idNumber: submission.id_number,
          idType: submission.id_type,
          method: submission.method,
          note: submission.status === "PENDING" ? submission.note : null,
          reason: submission.reason,
          registryName: submission.registry_name,
          source: submission.source,
          status: submission.status,
        }
      : null,
  };
}

/** Writes the review outcome onto the business, and its workspace. */
async function applyReview(wallet: string, review: BusinessReviewStatus) {
  const owner = wallet.toLowerCase();
  const profile = await loadBusinessProfile(owner);
  if (!profile) return;
  const status = businessProfileVerificationStatus({ ...profile, review_status: review });

  const updated = await accountDb()
    .from(accountTables.businessProfiles)
    .update({ review_status: review, updated_at: nowIso(), verification_status: status })
    .eq("wallet_address", owner);
  if (updated.error) throw new Error(migrationMessage);

  // The workspace badge (switcher, public profile) mirrors the business.
  const workspaces = await businessDb()
    .from(businessTables.workspaces)
    .select("id")
    .eq("owner_user_wallet", owner)
    .eq("kind", "business");
  for (const workspace of (workspaces.data ?? []) as { id: string }[]) {
    await businessDb()
      .from(businessTables.profiles)
      .update({ updated_at: nowIso(), verification_status: status })
      .eq("workspace_id", workspace.id);
  }
}

export async function submitVerification(
  wallet: string,
  input: { idType: unknown; idNumber: unknown },
) {
  const owner = wallet.toLowerCase();
  const state = await getVerificationState(owner);
  if (!state.ready) throw accountErrors.invalid(migrationMessage);
  if (!state.eligible) {
    throw accountErrors.invalid(
      state.missing.length > 0
        ? `Complete your profile first: ${state.missing.join(", ")}.`
        : "Choose your country in your profile first.",
    );
  }
  if (state.review === "APPROVED") throw accountErrors.invalid("Your business is already verified.");
  if (state.submission?.status === "PENDING") {
    throw accountErrors.invalid("Your last submission is still being reviewed.");
  }

  const option = state.options.find((candidate) => candidate.type === input.idType);
  if (!option || typeof input.idNumber !== "string") {
    throw accountErrors.invalid("Choose an ID type and enter the number.");
  }
  const countryCode = state.country!.code;
  const idNumber = normalizeBusinessId(option.type, countryCode, input.idNumber);
  const shapeError = businessIdShapeError(option.type, countryCode, idNumber);
  if (shapeError) throw accountErrors.invalid(shapeError);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await accountDb()
    .from(submissionsTable)
    .select("id", { count: "exact", head: true })
    .eq("wallet_address", owner)
    .gte("created_at", since);
  if ((recent.count ?? 0) >= maxSubmissionsPerDay) {
    throw accountErrors.invalid("Too many attempts today. Try again tomorrow.");
  }

  const profile = (await loadBusinessProfile(owner))!;

  // One registration verifies one business.
  const taken = await accountDb()
    .from(submissionsTable)
    .select("wallet_address")
    .eq("country_code", countryCode)
    .eq("id_type", option.type)
    .eq("id_number", idNumber)
    .eq("status", "APPROVED")
    .neq("wallet_address", owner)
    .limit(1);

  let decision: Decision;
  if ((taken.data ?? []).length > 0) {
    decision = {
      method: "MANUAL",
      note: "This number already verifies another SwiftPay business.",
      reason: null,
      registryName: null,
      registryStatus: null,
      source: null,
      status: "PENDING",
    };
  } else {
    decision = decideFromRegistry(
      await lookUpBusinessId(option.type, countryCode, idNumber),
      profile.business_name,
      countryCode,
    );
  }

  const row = {
    business_name: profile.business_name,
    country_code: countryCode,
    id_number: idNumber,
    id_type: option.type,
    method: decision.method,
    note: decision.note,
    reason: decision.reason,
    registry_name: decision.registryName,
    registry_status: decision.registryStatus,
    reviewed_at: decision.status === "PENDING" ? null : nowIso(),
    reviewed_by: decision.status === "PENDING" ? null : decision.source,
    source: decision.source,
    status: decision.status,
    wallet_address: owner,
  };
  let inserted = await accountDb().from(submissionsTable).insert(row).select("*").single();
  // Lost a race to another business approving the same number: review it.
  if (inserted.error?.code === "23505") {
    inserted = await accountDb()
      .from(submissionsTable)
      .insert({
        ...row,
        method: "MANUAL",
        note: "This number already verifies another SwiftPay business.",
        reviewed_at: null,
        reviewed_by: null,
        status: "PENDING",
      })
      .select("*")
      .single();
  }
  if (inserted.error) {
    throw new Error(missingTable(inserted.error) ? migrationMessage : "Could not save your submission.");
  }

  const saved = inserted.data as VerificationSubmission;
  await applyReview(owner, saved.status === "APPROVED" ? "APPROVED" : saved.status === "PENDING" ? "PENDING" : "REJECTED");
  return getVerificationState(owner);
}

// ── Reviewer ────────────────────────────────────────────────────────────────

export async function listVerificationSubmissions(status: "PENDING" | "ALL") {
  let query = accountDb()
    .from(submissionsTable)
    .select("*")
    .order("created_at", { ascending: status === "PENDING" })
    .limit(100);
  if (status === "PENDING") query = query.eq("status", "PENDING");
  const { data, error } = await query;
  if (error) throw new Error(missingTable(error) ? migrationMessage : error.message);

  return ((data ?? []) as VerificationSubmission[]).map((submission) => ({
    ...submission,
    lookup: manualLookupSites[submission.country_code] ?? null,
  }));
}

export async function decideSubmission(input: {
  id: string;
  decision: unknown;
  reason: unknown;
  reviewer: string;
}) {
  if (input.decision !== "APPROVED" && input.decision !== "REJECTED") {
    throw accountErrors.invalid("Decision must be APPROVED or REJECTED.");
  }
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
  if (input.decision === "REJECTED" && !reason) {
    throw accountErrors.invalid("Give the business a reason when rejecting.");
  }

  const current = await accountDb().from(submissionsTable).select("*").eq("id", input.id).maybeSingle();
  const submission = current.data as VerificationSubmission | null;
  if (!submission) throw accountErrors.invalid("Submission not found.");
  if (submission.status !== "PENDING") throw accountErrors.invalid("This submission was already decided.");

  const updated = await accountDb()
    .from(submissionsTable)
    .update({
      method: "MANUAL",
      reason: input.decision === "REJECTED" ? reason : null,
      reviewed_at: nowIso(),
      reviewed_by: input.reviewer,
      status: input.decision,
      updated_at: nowIso(),
    })
    .eq("id", input.id)
    .eq("status", "PENDING");
  if (updated.error?.code === "23505") {
    throw accountErrors.invalid("This number already verifies another business — reject it or revoke that one first.");
  }
  if (updated.error) throw new Error(updated.error.message);

  await applyReview(submission.wallet_address, input.decision);
  return { ok: true };
}
