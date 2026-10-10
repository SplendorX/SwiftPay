// Server-only. Shared bits of the multichain API routes.
import { NextResponse } from "next/server";

import { MultichainError } from "@/lib/multichain/service";
import { consumeRateLimit } from "@/lib/rate-limit";
import { resolveSessionActorWallet, sessionControlsWallet } from "@/lib/recurring-auth";

/** The signed-in wallet the request acts for, or a 401. */
export async function requireOwner(requested: unknown) {
  const owner = await resolveSessionActorWallet(requested);
  if (!owner || !(await sessionControlsWallet(owner))) {
    throw new MultichainError("Sign in first.", 401);
  }
  return owner;
}

export async function requireRateLimit(key: string, max: number, windowSeconds: number) {
  if (!(await consumeRateLimit(key, max, windowSeconds))) {
    throw new MultichainError("Too many requests. Try again in a minute.", 429);
  }
}

export function multichainJson(data: unknown, status = 200) {
  const response = NextResponse.json(data, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function multichainErrorResponse(error: unknown) {
  if (error instanceof MultichainError) {
    return multichainJson({ message: error.message }, error.status);
  }
  console.error("[multichain]", error);
  return multichainJson(
    { message: error instanceof Error ? error.message : "Something went wrong." },
    500,
  );
}
