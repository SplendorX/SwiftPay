import { recordLedgerEntry, getSwiftPointsSummary } from "@/lib/referral/ledger-service";
import { readReferralDbError, referralDb, referralTables } from "@/lib/referral/db";
import {
  FEATURE_UNLOCK_COST,
  FEATURE_UNLOCK_TERM_LABEL,
  FEATURE_UNLOCK_TERM_MONTHS,
  type SwiftPointsEntitlementRecord,
  type SwiftPointsFeature,
} from "@/lib/referral/types";

/**
 * Features unlocked by spending SwiftPoints, one term at a time.
 *
 * Distinct from redemption: redeeming cashes points out to USDC, unlocking
 * burns them for access and pays nothing out. Both debit the same ledger, so a
 * wallet's balance stays the single source of truth.
 *
 * A renewal extends the same row rather than inserting another, so there is
 * always exactly one entitlement per wallet per feature.
 */

/**
 * Advance by whole months rather than a fixed day count, so a term always
 * lands on the same day of the month regardless of month lengths.
 */
function addTerm(from: Date) {
  const next = new Date(from);
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + FEATURE_UNLOCK_TERM_MONTHS);
  // Rolled past the end of a shorter month (31 Aug + 6 would be 31 Feb);
  // clamp back to that month's last day.
  if (next.getUTCDate() !== day) {
    next.setUTCDate(0);
  }
  return next;
}

export function isEntitlementActive(
  entitlement: Pick<SwiftPointsEntitlementRecord, "expires_at"> | null,
): boolean {
  if (!entitlement?.expires_at) return false;
  const expiry = new Date(entitlement.expires_at).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

export async function listEntitlements(
  walletAddress: string,
): Promise<SwiftPointsEntitlementRecord[]> {
  const wallet = walletAddress.toLowerCase();
  const supabase = referralDb();
  const { data, error } = await supabase
    .from(referralTables.entitlements)
    .select("*")
    .eq("wallet_address", wallet);

  if (error) {
    throw new Error(readReferralDbError(error, "Failed to load entitlements."));
  }

  return (data ?? []) as SwiftPointsEntitlementRecord[];
}

export async function getEntitlement(
  walletAddress: string,
  feature: SwiftPointsFeature,
): Promise<SwiftPointsEntitlementRecord | null> {
  const supabase = referralDb();
  const { data, error } = await supabase
    .from(referralTables.entitlements)
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .eq("feature", feature)
    .maybeSingle();

  if (error) {
    throw new Error(readReferralDbError(error, "Failed checking entitlement."));
  }

  return (data as SwiftPointsEntitlementRecord | null) ?? null;
}

/** True only while the paid term is still running. */
export async function hasEntitlement(
  walletAddress: string,
  feature: SwiftPointsFeature,
): Promise<boolean> {
  return isEntitlementActive(await getEntitlement(walletAddress, feature));
}

/**
 * Buy or renew a term of access.
 *
 * Renewing early stacks: the new term starts from the current expiry rather
 * than from today, so nobody loses paid days by renewing ahead of time. An
 * expired entitlement restarts from now instead, so a lapse cannot be
 * back-paid into a term that already elapsed.
 */
export async function unlockFeature(input: {
  feature: SwiftPointsFeature;
  /**
   * Deliberately extend a term that is still running.
   *
   * Without this the stacking below was unreachable: an active term always
   * returned early, so "renew before it lapses" charged nothing and extended
   * nothing. A renewal adds a full term to the time already left.
   */
  renew?: boolean;
  walletAddress: string;
}): Promise<{
  alreadyUnlocked: boolean;
  entitlement: SwiftPointsEntitlementRecord;
}> {
  const wallet = input.walletAddress.toLowerCase();
  const cost = FEATURE_UNLOCK_COST[input.feature];
  const supabase = referralDb();

  const existing = await getEntitlement(wallet, input.feature);

  // Already inside a paid term: nothing to charge unless this is a renewal.
  if (existing && isEntitlementActive(existing) && !input.renew) {
    return { alreadyUnlocked: true, entitlement: existing };
  }

  const summary = await getSwiftPointsSummary(wallet);
  if (summary.available < cost) {
    throw new Error(
      `${FEATURE_UNLOCK_TERM_LABEL} of this feature costs ${cost} SwiftPoints. You have ${summary.available}.`,
    );
  }

  const now = new Date();
  const previousExpiry = existing?.expires_at
    ? new Date(existing.expires_at)
    : null;
  const termStart =
    previousExpiry && previousExpiry.getTime() > now.getTime()
      ? previousExpiry
      : now;
  const expiresAt = addTerm(termStart).toISOString();

  // Debit first: a failed write afterwards leaves a recorded spend we can
  // reconcile, whereas granting first could hand out a free term. The key is
  // tied to the term being replaced, so each renewal is charged exactly once.
  const { entry } = await recordLedgerEntry({
    description: `${existing ? "Renewed" : "Unlocked"} ${input.feature
      .replace(/_/g, " ")
      .toLowerCase()} for ${FEATURE_UNLOCK_TERM_LABEL}`,
    entryType: "ENTITLEMENT_UNLOCK",
    idempotencyKey: `entitlement:${wallet}:${input.feature}:${
      existing?.expires_at ?? "initial"
    }`,
    metadata: { expiresAt, feature: input.feature },
    points: -cost,
    walletAddress: wallet,
  });

  const payload = {
    expires_at: expiresAt,
    feature: input.feature,
    ledger_entry_id: entry.id,
    points_spent: cost,
    wallet_address: wallet,
    ...(existing ? { renewed_at: now.toISOString() } : {}),
  };

  const saved = await supabase
    .from(referralTables.entitlements)
    .upsert(payload, { onConflict: "wallet_address,feature" })
    .select("*")
    .single();

  if (saved.error) {
    throw new Error(
      readReferralDbError(saved.error, "Failed to grant the unlock."),
    );
  }

  return {
    alreadyUnlocked: false,
    entitlement: saved.data as SwiftPointsEntitlementRecord,
  };
}
