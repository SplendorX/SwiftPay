// Server-only. Shared bits of the Checkout API routes.
import type { NextRequest, NextResponse } from "next/server";

import { checkoutErrors } from "@/lib/checkout/errors";
import { consumeRateLimit } from "@/lib/rate-limit";

/** The caller's IP as the edge saw it (first x-forwarded-for hop). */
export function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** Throws a 429 once `key` passes `max` hits per `windowSeconds`. */
export async function requireRateLimit(key: string, max: number, windowSeconds: number) {
  if (!(await consumeRateLimit(key, max, windowSeconds))) {
    throw checkoutErrors.rateLimited();
  }
}

/** Public charge state changes every few seconds; never cache it. */
export function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
