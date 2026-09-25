import crypto from "node:crypto";

const legacySecretNames = [
  "REFERRAL_ADMIN_SECRET",
  "TRACTION_ADMIN_SECRET",
  "EARN_ADMIN_SECRET",
] as const;

/** Shorter secrets are refused outright rather than trusted. */
const minimumSecretLength = 32;

let warnedLegacy = false;

/**
 * The one admin secret. `ADMIN_SECRET` is the setting; the older per-area
 * names are read only when it is missing, and only while they all agree, so
 * no second key can quietly unlock the admin API.
 */
export function getAdminSecret() {
  const primary = process.env.ADMIN_SECRET?.trim();
  if (primary) {
    return primary.length >= minimumSecretLength ? primary : "";
  }

  const legacy = legacySecretNames
    .map((name) => process.env[name]?.trim())
    .filter((value): value is string => Boolean(value));
  if (legacy.length === 0 || new Set(legacy).size > 1) {
    return "";
  }
  if (!warnedLegacy) {
    warnedLegacy = true;
    console.warn("[admin-auth] Using a legacy admin secret name; set ADMIN_SECRET instead.");
  }
  return legacy[0].length >= minimumSecretLength ? legacy[0] : "";
}

function constantTimeEqual(a: string, b: string) {
  // Hashing first makes both sides the same length, so timingSafeEqual never
  // throws and the comparison time says nothing about the secret.
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

/** `Authorization: Bearer <ADMIN_SECRET>` only — never a query string. */
export function isAdminAuthorized(request: Request): boolean {
  const secret = getAdminSecret();
  if (!secret) {
    // Local `next dev` without a secret can inspect admin pages; nothing else can.
    return process.env.NODE_ENV === "development";
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return Boolean(match) && constantTimeEqual(match![1].trim(), secret);
}
