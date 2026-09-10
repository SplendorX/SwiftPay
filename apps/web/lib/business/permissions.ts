import { businessErrors } from "@/lib/business/errors";
import type {
  BusinessPermission,
  BusinessRole,
  WorkspaceMemberRecord,
} from "@/lib/business/types";

const rolePermissions: Record<BusinessRole, readonly BusinessPermission[]> = {
  owner: [
    "business.view",
    "business.edit",
    "wallet.view",
    "wallet.send",
    "transactions.view",
    "transactions.export",
    "payments.create",
    "payments.approve",
    "payments.cancel",
    "requests.create",
    "requests.manage",
    "team.view",
    "team.invite",
    "team.edit",
    "team.remove",
    "roles.view",
    "roles.manage",
    "profile.view",
    "profile.edit",
    "settings.view",
    "settings.manage",
  ],
  admin: [
    "business.view",
    "wallet.view",
    "wallet.send",
    "transactions.view",
    "transactions.export",
    "payments.create",
    "payments.approve",
    "payments.cancel",
    "requests.create",
    "requests.manage",
    "team.view",
    "team.invite",
    "team.edit",
    "team.remove",
    "roles.view",
    "profile.view",
    "profile.edit",
    "settings.view",
  ],
  finance: [
    "business.view",
    "wallet.view",
    "wallet.send",
    "transactions.view",
    "transactions.export",
    "payments.create",
    "payments.approve",
    "requests.create",
    "requests.manage",
    "profile.view",
  ],
  member: [
    "business.view",
    "transactions.view",
    "requests.create",
    "profile.view",
  ],
  viewer: [
    "business.view",
    "transactions.view",
    "transactions.export",
    "profile.view",
    "settings.view",
  ],
};

export function permissionsForRole(
  role: BusinessRole,
): readonly BusinessPermission[] {
  return rolePermissions[role];
}

export function hasPermission(role: BusinessRole, permission: BusinessPermission) {
  return rolePermissions[role].includes(permission);
}

export function assertPermission(
  member: Pick<WorkspaceMemberRecord, "role" | "status"> | null,
  permission: BusinessPermission,
) {
  if (!member || member.status !== "active") {
    throw businessErrors.forbidden("You must be an active workspace member.");
  }

  if (!hasPermission(member.role, permission)) {
    throw businessErrors.forbidden();
  }
}

export function canManageRole(actor: BusinessRole, target: BusinessRole) {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin" && target !== "admin") return true;
  return false;
}

export function isBusinessRole(value: unknown): value is BusinessRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "finance" ||
    value === "member" ||
    value === "viewer"
  );
}

export function isInviteRole(
  value: unknown,
): value is Exclude<BusinessRole, "owner"> {
  return (
    value === "admin" ||
    value === "finance" ||
    value === "member" ||
    value === "viewer"
  );
}
