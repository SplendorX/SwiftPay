import { requireWorkspaceContext } from "@/lib/business/auth";
import { businessDb, businessTables, readBusinessDbError } from "@/lib/business/db";
import { businessErrors } from "@/lib/business/errors";
import { canManageRole, isInviteRole } from "@/lib/business/permissions";
import { normalizeHandle } from "@/lib/business/usernames";
import type {
  InviteRole,
  WorkspaceInvitationRecord,
  WorkspaceMemberRecord,
} from "@/lib/business/types";
import { loadUserProfile } from "@/lib/business/service";

function nowIso() {
  return new Date().toISOString();
}

export async function listMembers(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
  workspaceId: string;
}) {
  const { workspace } = await requireWorkspaceContext({
    ...input,
    permission: "team.view",
  });
  const supabase = businessDb();
  const members = await supabase
    .from(businessTables.members)
    .select("*")
    .eq("workspace_id", workspace.id)
    .in("status", ["active", "invited"])
    .order("created_at", { ascending: true });

  if (members.error) {
    throw new Error(readBusinessDbError(members.error, "Could not load team."));
  }

  const rows = (members.data ?? []) as WorkspaceMemberRecord[];
  const wallets = rows.map((row) => row.user_wallet);
  const profiles =
    wallets.length > 0
      ? await supabase
          .from(businessTables.userProfiles)
          .select("wallet_address,username,display_name,avatar_url")
          .in("wallet_address", wallets)
      : { data: [], error: null };

  const profileMap = new Map(
    ((profiles.data ?? []) as Array<{
      avatar_url: string | null;
      display_name: string | null;
      username: string;
      wallet_address: string;
    }>).map((row) => [row.wallet_address, row]),
  );

  return rows.map((member) => ({
    ...member,
    avatarUrl: profileMap.get(member.user_wallet)?.avatar_url ?? null,
    displayName: profileMap.get(member.user_wallet)?.display_name ?? null,
    username: profileMap.get(member.user_wallet)?.username ?? null,
  }));
}

export async function inviteMember(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
  role: unknown;
  username: string;
  workspaceId: string;
}) {
  const { actorWallet, member, workspace } = await requireWorkspaceContext({
    ...input,
    permission: "team.invite",
  });

  if (!isInviteRole(input.role)) {
    throw businessErrors.invalid("Choose a valid role.");
  }

  if (!canManageRole(member.role, input.role)) {
    throw businessErrors.forbidden("You cannot assign that role.");
  }

  const username = normalizeHandle(input.username);
  const supabase = businessDb();
  const profile = await supabase
    .from(businessTables.userProfiles)
    .select("wallet_address,username")
    .ilike("username", username)
    .limit(1)
    .maybeSingle();

  if (profile.error) {
    throw new Error(readBusinessDbError(profile.error, "Could not find that user."));
  }

  const invited = profile.data as {
    username: string;
    wallet_address: string;
  } | null;

  if (invited) {
    const existing = await supabase
      .from(businessTables.members)
      .select("id,status")
      .eq("workspace_id", workspace.id)
      .eq("user_wallet", invited.wallet_address)
      .maybeSingle();
    const existingMember = existing.data as {
      status: string;
    } | null;
    if (existingMember?.status === "active") {
      throw businessErrors.conflict("That person is already on the team.");
    }
  }

  const settings = await supabase
    .from(businessTables.settings)
    .select("max_members")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const maxMembers =
    (settings.data as { max_members?: number } | null)?.max_members ?? 100;
  const count = await supabase
    .from(businessTables.members)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("status", "active");
  if ((count.count ?? 0) >= maxMembers) {
    throw businessErrors.conflict("This business has reached its member limit.");
  }

  const created = await supabase
    .from(businessTables.invitations)
    .insert({
      invited_by_wallet: actorWallet,
      invited_user_wallet: invited?.wallet_address ?? null,
      invited_username: invited?.username ?? username,
      role: input.role as InviteRole,
      status: "pending",
      updated_at: nowIso(),
      workspace_id: workspace.id,
    })
    .select("*")
    .single();

  if (created.error) {
    throw new Error(readBusinessDbError(created.error, "Could not send the invite."));
  }

  return created.data as WorkspaceInvitationRecord;
}

export async function listInvitations(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
  workspaceId: string;
}) {
  const { workspace } = await requireWorkspaceContext({
    ...input,
    permission: "team.view",
  });
  const supabase = businessDb();
  const invitations = await supabase
    .from(businessTables.invitations)
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (invitations.error) {
    throw new Error(readBusinessDbError(invitations.error, "Could not load invitations."));
  }

  return (invitations.data ?? []) as WorkspaceInvitationRecord[];
}

export async function updateMemberRole(input: {
  circleSocialUuid?: unknown;
  memberWallet: string;
  ownerWallet: unknown;
  role: unknown;
  workspaceId: string;
}) {
  const { actorWallet, member, workspace } = await requireWorkspaceContext({
    ...input,
    permission: "team.edit",
  });

  if (!isInviteRole(input.role)) {
    throw businessErrors.invalid("Choose a valid role.");
  }

  if (input.memberWallet.toLowerCase() === actorWallet) {
    throw businessErrors.forbidden("You cannot change your own role.");
  }

  const supabase = businessDb();
  const target = await supabase
    .from(businessTables.members)
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("user_wallet", input.memberWallet.toLowerCase())
    .maybeSingle();

  const targetMember = target.data as WorkspaceMemberRecord | null;
  if (!targetMember) throw businessErrors.notFound("Member");
  if (targetMember.role === "owner") {
    throw businessErrors.forbidden("The owner cannot be reassigned.");
  }
  if (!canManageRole(member.role, targetMember.role)) {
    throw businessErrors.forbidden();
  }

  const update = await supabase
    .from(businessTables.members)
    .update({ role: input.role, updated_at: nowIso() })
    .eq("id", targetMember.id)
    .select("*")
    .single();

  if (update.error) {
    throw new Error(readBusinessDbError(update.error, "Could not update the role."));
  }

  return update.data as WorkspaceMemberRecord;
}

export async function removeMember(input: {
  circleSocialUuid?: unknown;
  memberWallet: string;
  ownerWallet: unknown;
  workspaceId: string;
}) {
  const { actorWallet, member, workspace } = await requireWorkspaceContext({
    ...input,
    permission: "team.remove",
  });

  const targetWallet = input.memberWallet.toLowerCase();
  if (targetWallet === actorWallet) {
    throw businessErrors.forbidden("Leave the workspace instead of removing yourself.");
  }

  const supabase = businessDb();
  const target = await supabase
    .from(businessTables.members)
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("user_wallet", targetWallet)
    .maybeSingle();

  const targetMember = target.data as WorkspaceMemberRecord | null;
  if (!targetMember) throw businessErrors.notFound("Member");
  if (targetMember.role === "owner") {
    throw businessErrors.forbidden("The owner cannot be removed.");
  }
  if (!canManageRole(member.role, targetMember.role)) {
    throw businessErrors.forbidden();
  }

  const update = await supabase
    .from(businessTables.members)
    .update({ status: "removed", updated_at: nowIso() })
    .eq("id", targetMember.id);

  if (update.error) {
    throw new Error(readBusinessDbError(update.error, "Could not remove the member."));
  }
}

export async function cancelInvitation(input: {
  circleSocialUuid?: unknown;
  invitationId: string;
  ownerWallet: unknown;
  workspaceId: string;
}) {
  await requireWorkspaceContext({
    ...input,
    permission: "team.invite",
  });
  const supabase = businessDb();
  const update = await supabase
    .from(businessTables.invitations)
    .update({ status: "cancelled", updated_at: nowIso() })
    .eq("id", input.invitationId)
    .eq("workspace_id", input.workspaceId);

  if (update.error) {
    throw new Error(readBusinessDbError(update.error, "Could not cancel the invitation."));
  }
}

export { loadUserProfile };
