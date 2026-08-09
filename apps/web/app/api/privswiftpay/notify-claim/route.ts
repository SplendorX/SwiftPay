import { NextResponse, type NextRequest } from "next/server";

import { notifyRecipientOfPrivSwiftPayClaim } from "@/lib/privswiftpay/notify-claim";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/**
 * POST body: { claimCode: string, relatedTxHash?: string }
 * After a sender funds escrow, notify the receiver with the claim code.
 * Auth is the funded on-chain payment itself (code must match escrow state).
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const claimCode =
    typeof body.claimCode === "string" ? body.claimCode.trim() : "";
  if (!claimCode) {
    return jsonError("claimCode is required.", 400);
  }

  const relatedTxHash =
    typeof body.relatedTxHash === "string" && body.relatedTxHash.trim()
      ? body.relatedTxHash.trim()
      : null;

  try {
    const result = await notifyRecipientOfPrivSwiftPayClaim({
      claimCode,
      relatedTxHash,
    });

    return NextResponse.json({
      ok: true,
      alreadyNotified: result.alreadyNotified,
      recipient: result.payload.recipient,
      amount: result.payload.amount,
      token: result.payload.token,
      notificationId: result.notification?.id ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not notify the claim recipient.";
    const status =
      message.includes("not funded") ||
      message.includes("not a valid") ||
      message.includes("invalid") ||
      message.includes("already been redeemed") ||
      message.includes("does not match")
        ? 400
        : 500;
    return jsonError(message, status);
  }
}
