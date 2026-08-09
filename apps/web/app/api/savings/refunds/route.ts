import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import type { Hash } from "viem";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import { swiftSaveVaultAddress } from "@/lib/save/config";
import { readIdempotencyKey } from "@/lib/save/idempotency";
import { pocketIdToBytes32 } from "@/lib/save/pocket-id";
import {
  confirmSavingsTransaction,
  createSavingsReversal,
  getPocketForOwner,
  readSavingsSupabaseError,
} from "@/lib/save/service";
import {
  isValidTxHash,
  isValidUuid,
  normalizeIdempotencyKey,
} from "@/lib/save/validation";
import { arcTestnetTokens } from "@/lib/tokens";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/**
 * Create an explicit REVERSAL/ADJUSTMENT for a completed savings transfer
 * after a payment refund. Does not mutate historical records.
 *
 * Flow:
 * 1) POST → PENDING reversal + vault withdraw calldata
 * 2) Client executes vault.withdraw (external or Circle)
 * 3) PUT → confirm with txHash (on-chain receipt is source of truth)
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
    return jsonError("Authorize this wallet before reversing savings.", 401);
  }

  if (
    typeof body.originalTransactionId !== "string" ||
    !isValidUuid(body.originalTransactionId)
  ) {
    return jsonError("A valid originalTransactionId is required.", 400);
  }

  const idempotencyKey =
    readIdempotencyKey(request, body) ??
    normalizeIdempotencyKey(body.idempotencyKey) ??
    `reversal:${body.originalTransactionId}:${randomUUID()}`;

  const mode =
    body.mode === "ADJUSTMENT" || body.mode === "REVERSAL"
      ? body.mode
      : "REVERSAL";

  try {
    const transaction = await createSavingsReversal({
      ownerWallet,
      originalTransactionId: body.originalTransactionId,
      idempotencyKey,
      reason:
        typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined,
      mode,
    });

    const pocket = await getPocketForOwner(transaction.pocket_id, ownerWallet);
    const currency = transaction.currency;
    const token = arcTestnetTokens[currency];
    const vault = swiftSaveVaultAddress();

    return NextResponse.json(
      {
        transaction,
        vaultAddress: vault,
        pocketIdBytes32: pocket ? pocketIdToBytes32(pocket.id) : null,
        tokenAddress: token.address,
        amountUnits: transaction.amount_units,
        nextStep: {
          action: "vault.withdraw",
          then: "PUT /api/savings/refunds with transactionId + txHash",
        },
        message:
          transaction.status === "COMPLETED"
            ? "Reversal already completed (idempotent)."
            : "Reversal is PENDING. Execute vault.withdraw, then PUT this endpoint with the tx hash to finalize.",
      },
      { status: transaction.status === "COMPLETED" ? 200 : 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Reversal could not be created.");
    const status =
      message.includes("not found")
        ? 404
        : message.includes("already reversed") ||
            message.includes("cannot be reversed") ||
            message.includes("Only completed")
          ? 400
          : 500;
    return jsonError(message, status);
  }
}

/** Confirm reversal after on-chain vault.withdraw succeeds. */
export async function PUT(request: NextRequest) {
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
    return jsonError("Authorize this wallet before confirming reversals.", 401);
  }

  if (
    typeof body.transactionId !== "string" ||
    !isValidUuid(body.transactionId)
  ) {
    return jsonError("A valid transactionId is required.", 400);
  }

  if (!isValidTxHash(body.txHash)) {
    return jsonError("A valid on-chain transaction hash is required.", 400);
  }

  if (!swiftSaveVaultAddress()) {
    return jsonError(
      "SwiftSaveVault is not configured. Set NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS.",
      503,
    );
  }

  try {
    const result = await confirmSavingsTransaction({
      transactionId: body.transactionId,
      ownerWallet,
      txHash: body.txHash as Hash,
      direction: "withdraw",
    });

    if (
      result.transaction.type !== "REVERSAL" &&
      result.transaction.type !== "ADJUSTMENT" &&
      result.transaction.type !== "REFUND" &&
      result.transaction.type !== "WITHDRAWAL"
    ) {
      return jsonError(
        "This endpoint is for refund/reversal confirmation only.",
        400,
      );
    }

    return NextResponse.json({
      transaction: result.transaction,
      pocket: result.pocket,
      message: "Reversal confirmed. Pocket balance updated from on-chain receipt.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Reversal could not be confirmed.");
    return jsonError(message, 500);
  }
}
