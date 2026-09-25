import { NextResponse, type NextRequest } from "next/server";

import { jsonError, readJsonRecord } from "@/lib/http";
import {
  assertRecurringAccess,
  resolveSessionActorWallet,
} from "@/lib/recurring-auth";
import { loadIntentById, updateIntentStatus } from "@/lib/payment-engine/ledger";

export const runtime = "nodejs";

/**
 * Statuses a person may still call off.
 *
 * Once an intent reaches the executor the money is already in motion at
 * Circle, and marking it cancelled here would describe a payment that is
 * actually on its way. Those are refused rather than silently ignored.
 */
const cancellable = new Set(["pending", "policy_check", "approved"]);

type CancelBody = {
  circleSocialUuid?: unknown;
  ownerWallet?: unknown;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const intentId = id?.trim();

  if (!intentId) {
    return jsonError("An intent id is required.", 400);
  }

  const body = (await readJsonRecord<CancelBody>(request)) ?? {};
  const ownerWallet = await resolveSessionActorWallet(body.ownerWallet);

  if (!ownerWallet) {
    return jsonError("Sign in before cancelling a payment.", 401);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before cancelling a payment.", 401);
  }

  try {
    const intent = await loadIntentById(intentId);

    if (!intent) {
      return jsonError("Payment intent was not found.", 404);
    }

    if (intent.initiatorId.toLowerCase() !== ownerWallet.toLowerCase()) {
      return jsonError("This payment intent belongs to another wallet.", 403);
    }

    // Cancelling something already cancelled is the outcome the caller wanted,
    // so it succeeds rather than erroring on a double click.
    if (intent.status === "cancelled") {
      return NextResponse.json({ intentId, status: "cancelled" });
    }

    if (!cancellable.has(intent.status)) {
      return jsonError(
        `This payment is ${intent.status.replace("_", " ")} and can no longer be cancelled.`,
        409,
      );
    }

    await updateIntentStatus(intentId, "cancelled", {
      metadata: {
        ...intent.metadata,
        cancelledAt: new Date().toISOString(),
        cancelledBy: ownerWallet.toLowerCase(),
      },
    });

    return NextResponse.json({ intentId, status: "cancelled" });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "The payment could not be cancelled.",
      500,
    );
  }
}
