import { NextResponse, type NextRequest } from "next/server";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import { markPaymentRequestLifecycle } from "@/lib/save/notifications";

export const runtime = "nodejs";

type CompletePaymentRequestBody = {
  circleSocialUuid?: unknown;
  ownerWallet?: unknown;
  requestId?: unknown;
  txHash?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  let body: CompletePaymentRequestBody;

  try {
    body = (await request.json()) as CompletePaymentRequestBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const txHash = typeof body.txHash === "string" ? body.txHash.trim() : null;

  if (!ownerWallet) {
    return jsonError("Connect a wallet before completing a request.", 400);
  }

  if (!requestId) {
    return jsonError("A payment request id is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before completing a request.", 401);
  }

  try {
    const result = await markPaymentRequestLifecycle({
      ownerWallet,
      paidTxHash: txHash,
      requestId,
      status: "paid",
    });

    if (result.status === "declined") {
      return jsonError("This payment request was declined.", 409);
    }
    if (result.status === "expired") {
      return jsonError("This payment request has expired.", 409);
    }

    return NextResponse.json({
      alreadyResolved: result.alreadyResolved,
      ok: true,
      status: result.status,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Payment request could not be completed.";
    return jsonError(message, 500);
  }
}
