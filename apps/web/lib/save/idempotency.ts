import type { NextRequest } from "next/server";

/** Read Idempotency-Key header or body field. */
export function readIdempotencyKey(
  request: NextRequest,
  body?: Record<string, unknown>,
): string | null {
  const header =
    request.headers.get("idempotency-key") ??
    request.headers.get("Idempotency-Key");
  if (header && header.trim().length >= 8 && header.trim().length <= 128) {
    return header.trim();
  }
  if (body && typeof body.idempotencyKey === "string") {
    const key = body.idempotencyKey.trim();
    if (key.length >= 8 && key.length <= 128) return key;
  }
  return null;
}
