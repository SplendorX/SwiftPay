import { NextResponse, type NextRequest } from "next/server";
import { KitError } from "@circle-fin/onramp-kit/server";

import { onrampServer, onrampSessionInput } from "@/lib/onramp-server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { normalizeOwnerWallet, sessionControlsWallet } from "@/lib/recurring-auth";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { headers: noStore, status });
}

/** Whether buying USDC is available, so the deposit page can offer it. */
export async function GET() {
  return NextResponse.json(
    { enabled: Boolean(process.env.ONRAMP_API_KEY?.trim()) },
    { headers: noStore },
  );
}

/**
 * Mint an onramp session that pays into the caller's own wallet. The body's
 * destinationAddress must be a wallet the signed session controls; nothing
 * else in the body is trusted, so a caller can't send funds elsewhere or spend
 * the API key's quota for someone else's address.
 */
export async function POST(request: NextRequest) {
  const server = onrampServer();
  if (!server) {
    return jsonError("Buying USDC isn't available yet.", 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const wallet = normalizeOwnerWallet(body.destinationAddress);
  if (!wallet) {
    return jsonError("A valid wallet address is required.", 400);
  }
  if (!(await sessionControlsWallet(wallet))) {
    return jsonError("Sign in again to buy USDC.", 401);
  }
  if (!(await consumeRateLimit(`onramp-session:${wallet}`, 20, 3600))) {
    return jsonError("Too many attempts. Try again in a little while.", 429);
  }

  try {
    const session = await server.createSession(
      onrampSessionInput({ appUserId: wallet, destinationAddress: wallet }),
    );
    return NextResponse.json(session, { headers: noStore });
  } catch (error) {
    console.warn(
      "[onramp] session failed",
      error instanceof KitError ? `${error.type} ${error.code}` : error,
    );
    if (error instanceof KitError && error.type === "RATE_LIMIT") {
      return jsonError("Too many attempts. Try again in a little while.", 429);
    }
    return jsonError("Couldn't start the purchase. Try again.", 502);
  }
}
