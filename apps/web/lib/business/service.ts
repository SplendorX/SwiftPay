import { getAddress, isAddress } from "viem";

import { requireActorWallet, requireWorkspaceContext } from "@/lib/business/auth";
import { businessDb, businessTables, readBusinessDbError } from "@/lib/business/db";
import { businessErrors } from "@/lib/business/errors";
import { defaultApprovalPolicy, parseApprovalPolicy } from "@/lib/business/policy";
import {
  normalizeHandle,
  slugFromName,
  validateBusinessUsername,
} from "@/lib/business/usernames";
import type {
  BusinessProfileRecord,
  DirectoryHit,
  PaymentIdentityRecord,
  VerificationStatus,
  WorkspaceInvitationRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceSettingsRecord,
  WorkspaceSummary,
} from "@/lib/business/types";
import {
  normalizeUsername,
  validateUsername,
} from "@/lib/profile-utils";
import { isAppLocale } from "@/lib/locales";

const profileSelect =
  "wallet_address,username,circle_social_uuid,display_name,avatar_url,auth_provider,created_at,updated_at,bio,locale,onboarding_completed_at,account_type_selected,default_workspace_id";

export type OnboardingProfile = {
  account_type_selected: boolean;
  auth_provider: string;
  avatar_url: string | null;
  bio: string | null;
  circle_social_uuid: string | null;
  created_at: string;
  default_workspace_id: string | null;
  display_name: string | null;
  locale: string;
  onboarding_completed_at: string | null;
  updated_at: string;
  username: string;
  wallet_address: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeWallet(value: string) {
  if (!isAddress(value)) return null;
  return getAddress(value).toLowerCase();
}

function readError(error: { code?: string; message?: string } | null, fallback: string) {
  return readBusinessDbError(error, fallback);
}

export async function loadUserProfile(wallet: string) {
  const supabase = businessDb();
  const { data, error } = await supabase
    .from(businessTables.userProfiles)
    .select(profileSelect)
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(readError(error, "Could not load profile."));
  }

  return (data as OnboardingProfile | null) ?? null;
}

export async function listWorkspacesForUser(wallet: string): Promise<WorkspaceSummary[]> {
  const supabase = businessDb();
  const memberships = await supabase
    .from(businessTables.members)
    .select("workspace_id,role,status")
    .eq("user_wallet", wallet.toLowerCase())
    .eq("status", "active");

  if (memberships.error) {
    throw new Error(readError(memberships.error, "Could not load workspaces."));
  }

  const rows = (memberships.data ?? []) as Array<{
    role: WorkspaceSummary["role"];
    status: string;
    workspace_id: string;
  }>;

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.workspace_id);
  const workspaces = await supabase
    .from(businessTables.workspaces)
    .select("*")
    .in("id", ids)
    .eq("status", "active")
    .neq("kind", "business");

  if (workspaces.error) {
    throw new Error(readError(workspaces.error, "Could not load workspaces."));
  }

  const profiles = await supabase
    .from(businessTables.profiles)
    .select("workspace_id,verification_status,logo_url")
    .in("workspace_id", ids);

  const profileMap = new Map(
    ((profiles.data ?? []) as Array<{
      logo_url: string | null;
      verification_status: VerificationStatus;
      workspace_id: string;
    }>).map((row) => [row.workspace_id, row]),
  );
  const roleMap = new Map(rows.map((row) => [row.workspace_id, row.role]));

  return ((workspaces.data ?? []) as WorkspaceRecord[])
    .map((workspace) => {
      const profile = profileMap.get(workspace.id);
      return {
        circleWalletId: workspace.circle_wallet_id ?? null,
        id: workspace.id,
        kind: workspace.kind,
        logoUrl: profile?.logo_url ?? null,
        name: workspace.name,
        paymentWallet: workspace.payment_wallet,
        role: roleMap.get(workspace.id) ?? "member",
        username: workspace.username,
        verificationStatus:
          workspace.kind === "business"
            ? (profile?.verification_status ?? "UNVERIFIED")
            : null,
      };
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "individual" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function listPendingInvitations(wallet: string, username?: string | null) {
  const supabase = businessDb();
  let query = supabase
    .from(businessTables.invitations)
    .select("*")
    .eq("status", "pending")
    .gt("expires_at", nowIso());

  if (username) {
    query = query.or(
      `invited_user_wallet.eq.${wallet.toLowerCase()},invited_username.ilike.${username}`,
    );
  } else {
    query = query.eq("invited_user_wallet", wallet.toLowerCase());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(readError(error, "Could not load invitations."));
  }

  return (data ?? []) as WorkspaceInvitationRecord[];
}

async function claimPaymentIdentity(input: {
  destinationWallet: string;
  displayName: string;
  kind: "individual" | "business";
  profileWallet?: string | null;
  username: string;
  workspaceId: string;
}) {
  const supabase = businessDb();
  const username = normalizeHandle(input.username);
  const existing = await supabase
    .from(businessTables.identities)
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (existing.error) {
    throw new Error(readError(existing.error, "Could not check username."));
  }

  const row = existing.data as PaymentIdentityRecord | null;
  if (row && row.workspace_id !== input.workspaceId) {
    throw businessErrors.conflict("That username is already taken.");
  }

  const payload = {
    destination_wallet: input.destinationWallet.toLowerCase(),
    display_name: input.displayName,
    kind: input.kind,
    profile_wallet: input.profileWallet?.toLowerCase() ?? null,
    updated_at: nowIso(),
    username,
    workspace_id: input.workspaceId,
  };

  if (row) {
    const mutation = await supabase
      .from(businessTables.identities)
      .update(payload)
      .eq("username", username);
    if (mutation.error) {
      throw new Error(readError(mutation.error, "Could not update payment identity."));
    }
    return;
  }

  const insert = await supabase.from(businessTables.identities).insert({
    ...payload,
    created_at: nowIso(),
  });

  if (insert.error) {
    throw new Error(readError(insert.error, "Could not reserve payment identity."));
  }
}

async function usernameTaken(username: string, exceptWorkspaceId?: string) {
  const supabase = businessDb();
  const handle = normalizeHandle(username);

  const identity = await supabase
    .from(businessTables.identities)
    .select("username,workspace_id")
    .eq("username", handle)
    .maybeSingle();

  if (identity.error) {
    throw new Error(readError(identity.error, "Could not check username."));
  }

  if (
    identity.data &&
    (identity.data as { workspace_id: string }).workspace_id !== exceptWorkspaceId
  ) {
    return true;
  }

  const profile = await supabase
    .from(businessTables.userProfiles)
    .select("wallet_address")
    .ilike("username", handle)
    .limit(1)
    .maybeSingle();

  if (profile.error) {
    throw new Error(readError(profile.error, "Could not check username."));
  }

  return Boolean(profile.data);
}

export async function ensureIndividualWorkspace(input: {
  displayName?: string | null;
  paymentWallet: string;
  username: string;
}) {
  const supabase = businessDb();
  const wallet = input.paymentWallet.toLowerCase();
  const existing = await supabase
    .from(businessTables.workspaces)
    .select("*")
    .eq("owner_user_wallet", wallet)
    .eq("kind", "individual")
    .eq("status", "active")
    .maybeSingle();

  if (existing.error) {
    throw new Error(readError(existing.error, "Could not load personal workspace."));
  }

  if (existing.data) {
    const workspace = existing.data as WorkspaceRecord;
    await claimPaymentIdentity({
      destinationWallet: workspace.payment_wallet ?? wallet,
      displayName: input.displayName || input.username,
      kind: "individual",
      profileWallet: wallet,
      username: input.username,
      workspaceId: workspace.id,
    });
    return workspace;
  }

  const created = await supabase
    .from(businessTables.workspaces)
    .insert({
      kind: "individual",
      name: "Personal",
      owner_user_wallet: wallet,
      payment_wallet: wallet,
      status: "active",
      username: normalizeHandle(input.username),
      updated_at: nowIso(),
    })
    .select("*")
    .single();

  if (created.error) {
    throw new Error(readError(created.error, "Could not create personal workspace."));
  }

  const workspace = created.data as WorkspaceRecord;

  const member = await supabase.from(businessTables.members).insert({
    joined_at: nowIso(),
    role: "owner",
    status: "active",
    updated_at: nowIso(),
    user_wallet: wallet,
    workspace_id: workspace.id,
  });

  if (member.error) {
    throw new Error(readError(member.error, "Could not add personal membership."));
  }

  await claimPaymentIdentity({
    destinationWallet: wallet,
    displayName: input.displayName || input.username,
    kind: "individual",
    profileWallet: wallet,
    username: input.username,
    workspaceId: workspace.id,
  });

  return workspace;
}

export async function createBusinessWorkspace(input: {
  name: string;
  ownerWallet: string;
  paymentWallet: string;
  username: string;
}) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) {
    throw businessErrors.invalid("Enter a business name up to 80 characters.");
  }

  const usernameError = validateBusinessUsername(input.username);
  if (usernameError) {
    throw businessErrors.invalid(usernameError);
  }

  const username = normalizeHandle(input.username);
  if (await usernameTaken(username)) {
    throw businessErrors.conflict("That username is already taken.");
  }

  const wallet = input.ownerWallet.toLowerCase();
  const supabase = businessDb();
  const created = await supabase
    .from(businessTables.workspaces)
    .insert({
      kind: "business",
      name,
      owner_user_wallet: wallet,
      payment_wallet: input.paymentWallet.toLowerCase(),
      status: "active",
      username,
      updated_at: nowIso(),
    })
    .select("*")
    .single();

  if (created.error) {
    throw new Error(readError(created.error, "Could not create the business."));
  }

  const workspace = created.data as WorkspaceRecord;

  const member = await supabase.from(businessTables.members).insert({
    joined_at: nowIso(),
    role: "owner",
    status: "active",
    updated_at: nowIso(),
    user_wallet: wallet,
    workspace_id: workspace.id,
  });
  if (member.error) {
    throw new Error(readError(member.error, "Could not add the business owner."));
  }

  const profile = await supabase.from(businessTables.profiles).insert({
    updated_at: nowIso(),
    verification_status: "UNVERIFIED",
    workspace_id: workspace.id,
  });
  if (profile.error) {
    throw new Error(readError(profile.error, "Could not create the business profile."));
  }

  const settings = await supabase.from(businessTables.settings).insert({
    approval_policy: defaultApprovalPolicy(),
    approval_required: true,
    max_members: 100,
    required_approvals: 1,
    updated_at: nowIso(),
    workspace_id: workspace.id,
  });
  if (settings.error) {
    throw new Error(readError(settings.error, "Could not create business settings."));
  }

  await claimPaymentIdentity({
    destinationWallet: input.paymentWallet.toLowerCase(),
    displayName: name,
    kind: "business",
    profileWallet: wallet,
    username,
    workspaceId: workspace.id,
  });

  return workspace;
}

export async function attachBusinessWallet(input: {
  circleSocialUuid?: unknown;
  circleWalletId?: string | null;
  ownerWallet: string;
  paymentWallet: string;
  workspaceId: string;
}) {
  const { workspace } = await requireWorkspaceContext({
    circleSocialUuid: input.circleSocialUuid,
    ownerWallet: input.ownerWallet,
    permission: "settings.manage",
    workspaceId: input.workspaceId,
  });

  const paymentWallet = normalizeWallet(input.paymentWallet);
  if (!paymentWallet) {
    throw businessErrors.invalid("Enter a valid business wallet address.");
  }

  const ownerWallet = workspace.owner_user_wallet.toLowerCase();
  if (paymentWallet === ownerWallet) {
    throw businessErrors.invalid(
      "This business needs its own Circle SCA. The personal wallet cannot be reused.",
    );
  }

  const supabase = businessDb();
  const payload: Record<string, unknown> = {
    payment_wallet: paymentWallet,
    updated_at: nowIso(),
  };
  if (input.circleWalletId) {
    payload.circle_wallet_id = input.circleWalletId;
  }

  let mutation = await supabase
    .from(businessTables.workspaces)
    .update(payload)
    .eq("id", workspace.id)
    .select("*")
    .single();

  if (
    mutation.error &&
    input.circleWalletId &&
    /circle_wallet_id/i.test(mutation.error.message ?? "")
  ) {
    mutation = await supabase
      .from(businessTables.workspaces)
      .update({
        payment_wallet: paymentWallet,
        updated_at: nowIso(),
      })
      .eq("id", workspace.id)
      .select("*")
      .single();
  }

  if (mutation.error) {
    throw new Error(readError(mutation.error, "Could not attach the business wallet."));
  }

  const updated = mutation.data as WorkspaceRecord;
  if (updated.username) {
    await claimPaymentIdentity({
      destinationWallet: paymentWallet,
      displayName: updated.name,
      kind: updated.kind,
      profileWallet: updated.owner_user_wallet,
      username: updated.username,
      workspaceId: updated.id,
    });
  }

  return updated;
}

export async function completeOnboarding(input: {
  accountKind: "individual" | "business" | "join";
  bio?: string | null;
  businessName?: string;
  businessUsername?: string;
  circleSocialUuid?: unknown;
  invitationId?: string;
  locale: string;
  ownerWallet: string;
  username: string;
}) {
  const actorWallet = await requireActorWallet({
    circleSocialUuid: input.circleSocialUuid,
    ownerWallet: input.ownerWallet,
  });

  const username = normalizeUsername(input.username);
  const usernameError = validateUsername(username);
  if (usernameError) {
    throw businessErrors.invalid(usernameError);
  }

  const bio =
    typeof input.bio === "string" ? input.bio.trim().slice(0, 160) : "";
  const locale = isAppLocale(input.locale) ? input.locale : "en";

  const profile = await loadUserProfile(actorWallet);
  if (!profile) {
    throw businessErrors.invalid("Create your SwiftPay profile before continuing.");
  }

  if (
    username !== profile.username.toLowerCase() &&
    (await usernameTaken(username))
  ) {
    throw businessErrors.conflict("That username is already taken.");
  }

  const individual = await ensureIndividualWorkspace({
    displayName: profile.display_name,
    paymentWallet: actorWallet,
    username,
  });

  let defaultWorkspaceId = individual.id;

  if (input.accountKind === "business") {
    const business = await createBusinessWorkspace({
      name: input.businessName ?? "",
      ownerWallet: actorWallet,
      paymentWallet: actorWallet,
      username: input.businessUsername ?? slugFromName(input.businessName ?? "") ?? "",
    });
    defaultWorkspaceId = business.id;
  }

  if (input.accountKind === "join") {
    if (!input.invitationId) {
      throw businessErrors.invalid("Choose a business invitation to join.");
    }
    const joined = await acceptInvitation({
      circleSocialUuid: input.circleSocialUuid,
      invitationId: input.invitationId,
      ownerWallet: actorWallet,
    });
    defaultWorkspaceId = joined.workspace_id;
  }

  const supabase = businessDb();
  const mutation = await supabase
    .from(businessTables.userProfiles)
    .update({
      account_type_selected: true,
      bio: bio || null,
      default_workspace_id: defaultWorkspaceId,
      locale,
      onboarding_completed_at: nowIso(),
      updated_at: nowIso(),
      username,
    })
    .eq("wallet_address", actorWallet)
    .select(profileSelect)
    .single();

  if (mutation.error) {
    throw new Error(readError(mutation.error, "Could not finish onboarding."));
  }

  return {
    defaultWorkspaceId,
    profile: mutation.data as OnboardingProfile,
    workspaces: await listWorkspacesForUser(actorWallet),
  };
}

export async function setDefaultWorkspace(input: {
  circleSocialUuid?: unknown;
  ownerWallet: string;
  workspaceId: string;
}) {
  const actorWallet = await requireActorWallet({
    circleSocialUuid: input.circleSocialUuid,
    ownerWallet: input.ownerWallet,
  });
  const memberships = await listWorkspacesForUser(actorWallet);
  const next = memberships.find((item) => item.id === input.workspaceId);
  if (!next) {
    throw businessErrors.forbidden("You are not a member of that workspace.");
  }

  const supabase = businessDb();
  const mutation = await supabase
    .from(businessTables.userProfiles)
    .update({
      default_workspace_id: next.id,
      updated_at: nowIso(),
    })
    .eq("wallet_address", actorWallet);

  if (mutation.error) {
    throw new Error(readError(mutation.error, "Could not switch workspace."));
  }

  return next;
}

export async function acceptInvitation(input: {
  circleSocialUuid?: unknown;
  invitationId: string;
  ownerWallet: string;
}) {
  const actorWallet = await requireActorWallet({
    circleSocialUuid: input.circleSocialUuid,
    ownerWallet: input.ownerWallet,
  });
  const supabase = businessDb();
  const invitation = await supabase
    .from(businessTables.invitations)
    .select("*")
    .eq("id", input.invitationId)
    .maybeSingle();

  if (invitation.error) {
    throw new Error(readError(invitation.error, "Could not load invitation."));
  }

  const row = invitation.data as WorkspaceInvitationRecord | null;
  if (!row) throw businessErrors.notFound("Invitation");
  if (row.status !== "pending") {
    throw businessErrors.conflict("This invitation is no longer available.");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw businessErrors.conflict("This invitation has expired.");
  }

  const profile = await loadUserProfile(actorWallet);
  const invitedWallet = row.invited_user_wallet?.toLowerCase();
  const invitedUsername = row.invited_username?.toLowerCase();
  const matchesWallet = invitedWallet && invitedWallet === actorWallet;
  const matchesUsername =
    invitedUsername && profile && invitedUsername === profile.username.toLowerCase();

  if (!matchesWallet && !matchesUsername) {
    throw businessErrors.forbidden("This invitation is for a different SwiftPay user.");
  }

  const existing = await supabase
    .from(businessTables.members)
    .select("*")
    .eq("workspace_id", row.workspace_id)
    .eq("user_wallet", actorWallet)
    .maybeSingle();

  if (existing.error) {
    throw new Error(readError(existing.error, "Could not load membership."));
  }

  const memberRow = existing.data as WorkspaceMemberRecord | null;
  if (memberRow) {
    const update = await supabase
      .from(businessTables.members)
      .update({
        joined_at: nowIso(),
        role: row.role,
        status: "active",
        updated_at: nowIso(),
      })
      .eq("id", memberRow.id);
    if (update.error) {
      throw new Error(readError(update.error, "Could not join the business."));
    }
  } else {
    const settings = await supabase
      .from(businessTables.settings)
      .select("max_members")
      .eq("workspace_id", row.workspace_id)
      .maybeSingle();
    const maxMembers =
      (settings.data as { max_members?: number } | null)?.max_members ?? 100;
    const count = await supabase
      .from(businessTables.members)
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", row.workspace_id)
      .eq("status", "active");
    if ((count.count ?? 0) >= maxMembers) {
      throw businessErrors.conflict("This business has reached its member limit.");
    }

    const insert = await supabase.from(businessTables.members).insert({
      joined_at: nowIso(),
      role: row.role,
      status: "active",
      updated_at: nowIso(),
      user_wallet: actorWallet,
      workspace_id: row.workspace_id,
    });
    if (insert.error) {
      throw new Error(readError(insert.error, "Could not join the business."));
    }
  }

  const accepted = await supabase
    .from(businessTables.invitations)
    .update({
      invited_user_wallet: actorWallet,
      status: "accepted",
      updated_at: nowIso(),
    })
    .eq("id", row.id);

  if (accepted.error) {
    throw new Error(readError(accepted.error, "Could not accept the invitation."));
  }

  return row;
}

export async function declineInvitation(input: {
  circleSocialUuid?: unknown;
  invitationId: string;
  ownerWallet: string;
}) {
  const actorWallet = await requireActorWallet({
    circleSocialUuid: input.circleSocialUuid,
    ownerWallet: input.ownerWallet,
  });
  const supabase = businessDb();
  const mutation = await supabase
    .from(businessTables.invitations)
    .update({ status: "declined", updated_at: nowIso() })
    .eq("id", input.invitationId)
    .or(
      `invited_user_wallet.eq.${actorWallet},invited_username.eq.${actorWallet}`,
    );

  if (mutation.error) {
    throw new Error(readError(mutation.error, "Could not decline the invitation."));
  }
}

export async function resolvePaymentIdentity(username: string) {
  const handle = normalizeHandle(username);
  const supabase = businessDb();
  const identity = await supabase
    .from(businessTables.identities)
    .select("*")
    .eq("username", handle)
    .maybeSingle();

  if (identity.error) {
    throw new Error(readError(identity.error, "Could not resolve username."));
  }

  if (identity.data) {
    return identity.data as PaymentIdentityRecord;
  }

  const profile = await supabase
    .from(businessTables.userProfiles)
    .select("wallet_address,username,display_name")
    .ilike("username", handle)
    .limit(1)
    .maybeSingle();

  if (profile.error) {
    throw new Error(readError(profile.error, "Could not resolve username."));
  }

  if (!profile.data) return null;

  const row = profile.data as {
    display_name: string | null;
    username: string;
    wallet_address: string;
  };

  return {
    created_at: "",
    destination_wallet: row.wallet_address,
    display_name: row.display_name,
    kind: "individual" as const,
    profile_wallet: row.wallet_address,
    updated_at: "",
    username: row.username,
    workspace_id: null,
  };
}

export async function searchDirectory(query: string): Promise<DirectoryHit[]> {
  const q = query.trim().replace(/^@+/, "");
  if (q.length < 1) return [];

  const supabase = businessDb();
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const identities = await supabase
    .from(businessTables.identities)
    .select("*")
    .neq("kind", "business")
    .or(`username.ilike.${like},display_name.ilike.${like}`)
    .limit(12);

  if (identities.error) {
    throw new Error(readError(identities.error, "Search failed."));
  }

  const hits = (identities.data ?? []) as PaymentIdentityRecord[];
  const wallets = hits
    .map((hit) => hit.profile_wallet)
    .filter((value): value is string => Boolean(value));

  const profiles =
    wallets.length > 0
      ? await supabase
          .from(businessTables.userProfiles)
          .select("wallet_address,avatar_url,bio,display_name")
          .in("wallet_address", wallets)
      : { data: [], error: null };

  const profileMap = new Map(
    ((profiles.data ?? []) as Array<{
      avatar_url: string | null;
      bio: string | null;
      display_name: string | null;
      wallet_address: string;
    }>).map((row) => [row.wallet_address, row]),
  );

  const businessIds = hits
    .filter((hit) => hit.kind === "business" && hit.workspace_id)
    .map((hit) => hit.workspace_id!) ;

  const businessProfiles =
    businessIds.length > 0
      ? await supabase
          .from(businessTables.profiles)
          .select("workspace_id,description,logo_url,verification_status")
          .in("workspace_id", businessIds)
      : { data: [], error: null };

  const businessMap = new Map(
    ((businessProfiles.data ?? []) as Array<{
      description: string | null;
      logo_url: string | null;
      verification_status: VerificationStatus;
      workspace_id: string;
    }>).map((row) => [row.workspace_id, row]),
  );

  return hits.map((hit) => {
    const person = hit.profile_wallet
      ? profileMap.get(hit.profile_wallet)
      : undefined;
    const business = hit.workspace_id
      ? businessMap.get(hit.workspace_id)
      : undefined;
    return {
      avatarUrl:
        hit.kind === "business"
          ? (business?.logo_url ?? null)
          : (person?.avatar_url ?? null),
      bio:
        hit.kind === "business"
          ? (business?.description ?? null)
          : (person?.bio ?? null),
      displayName:
        hit.display_name ||
        person?.display_name ||
        hit.username,
      kind: hit.kind,
      username: hit.username,
      verificationStatus: business?.verification_status ?? null,
      workspaceId: hit.workspace_id,
    };
  });
}

export async function getPublicDirectoryProfile(username: string) {
  const handle = normalizeHandle(username);
  if (!handle) return null;
  const hits = await searchDirectory(handle);
  return (
    hits.find((hit) => hit.username === handle) ??
    hits[0] ??
    null
  );
}

export async function loadBusinessDetail(workspaceId: string) {
  const supabase = businessDb();
  const [workspace, profile, settings] = await Promise.all([
    supabase.from(businessTables.workspaces).select("*").eq("id", workspaceId).maybeSingle(),
    supabase.from(businessTables.profiles).select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from(businessTables.settings).select("*").eq("workspace_id", workspaceId).maybeSingle(),
  ]);

  if (workspace.error) {
    throw new Error(readError(workspace.error, "Could not load workspace."));
  }
  if (!workspace.data) throw businessErrors.notFound("Workspace");

  return {
    profile: (profile.data as BusinessProfileRecord | null) ?? null,
    settings: settings.data
      ? ({
          ...(settings.data as Omit<WorkspaceSettingsRecord, "approval_policy">),
          approval_policy: parseApprovalPolicy(
            (settings.data as { approval_policy?: unknown }).approval_policy,
          ),
        } as WorkspaceSettingsRecord)
      : null,
    workspace: workspace.data as WorkspaceRecord,
  };
}

export async function suggestedBusinessUsername(name: string) {
  const base = slugFromName(name);
  if (!base) return "";
  if (!(await usernameTaken(base))) return base;
  for (let i = 1; i < 20; i += 1) {
    const candidate = `${base}${i}`.slice(0, 30);
    if (!(await usernameTaken(candidate))) return candidate;
  }
  return base;
}

export function normalizeBusinessWallet(value: string) {
  return normalizeWallet(value);
}
