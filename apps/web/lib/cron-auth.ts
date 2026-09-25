import crypto from "node:crypto";

function constantTimeEqual(a: string, b: string) {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; `x-cron-secret`
 * is accepted for manual runs. Without a secret only local `next dev` may
 * trigger jobs, so a misconfigured deploy fails closed.
 */
export function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  const header = request.headers.get("x-cron-secret")?.trim();
  const presented = bearer ?? header;
  return Boolean(presented) && constantTimeEqual(presented!, secret);
}
