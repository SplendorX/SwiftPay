import { NextResponse, type NextRequest } from "next/server";
import type { Hash } from "viem";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import {
  confirmSavingsTransaction,
  readSavingsSupabaseError,
  updateSpendSaveEvent,
} from "@/lib/save/service";
import {
  isValidTxHash,
  isValidUuid,
} from "@/lib/save/validation";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const eventsTable =
  process.env.SUPABASE_SPEND_SAVE_EVENTS_TABLE ?? "spend_save_events";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/**
 * Finalize Spend&Save after savings vault deposit confirms on-chain.
 * Marks COMPLETED only when savings confirmation succeeds.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);
  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before completing Spend&Save.", 401);
  }

  if (
    typeof body.transactionId !== "string" ||
    !isValidUuid(body.transactionId)
  ) {
    return jsonError("A valid savings transactionId is required.", 400);
  }

  if (!isValidTxHash(body.txHash)) {
    return jsonError("A valid savings transaction hash is required.", 400);
  }

  if (typeof body.eventId !== "string" || !isValidUuid(body.eventId)) {
    return jsonError("A valid Spend&Save eventId is required.", 400);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const eventLoad = await supabase
      .from(eventsTable)
      .select("*")
      .eq("id", body.eventId)
      .eq("owner_wallet", ownerWallet)
      .maybeSingle();

    if (eventLoad.error || !eventLoad.data) {
      return jsonError("Spend&Save event not found.", 404);
    }

    if (eventLoad.data.status === "COMPLETED") {
      return NextResponse.json({
        event: eventLoad.data,
        alreadyCompleted: true,
      });
    }

    await updateSpendSaveEvent(body.eventId, ownerWallet, {
      status: "SAVINGS_SUBMITTED",
    });

    const result = await confirmSavingsTransaction({
      transactionId: body.transactionId,
      ownerWallet,
      txHash: body.txHash as Hash,
      direction: "deposit",
    });

    const event = await updateSpendSaveEvent(body.eventId, ownerWallet, {
      status: "COMPLETED",
      savings_transaction_id: result.transaction.id,
    });

    return NextResponse.json({
      event,
      transaction: result.transaction,
      pocket: result.pocket,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Spend&Save could not complete.");

    if (typeof body.eventId === "string" && isValidUuid(body.eventId)) {
      try {
        await updateSpendSaveEvent(body.eventId, ownerWallet, {
          status: message.includes("reconciliation")
            ? "REQUIRES_RECONCILIATION"
            : "FAILED",
          failure_reason: message.slice(0, 500),
        });
      } catch {
        // ignore
      }
    }

    return jsonError(message, 500);
  }
}
