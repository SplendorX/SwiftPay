// Server-only.
import { headers } from "next/headers";

/**
 * Whether session cookies should be marked Secure for this request.
 *
 * Browsers silently drop Secure cookies on plain-HTTP pages other than
 * localhost — so a production build opened from a phone on the LAN
 * (http://192.168.x.x) could never keep a sign-in challenge or session.
 * Decide from how the request actually arrived: HTTPS (directly, or via a
 * proxy's x-forwarded-proto) gets Secure cookies; plain HTTP doesn't.
 * Real deployments are HTTPS, so they're unaffected.
 */
export async function secureCookieFor() {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  return process.env.NODE_ENV === "production";
}
