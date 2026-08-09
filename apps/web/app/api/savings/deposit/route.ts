import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import type { Hash } from "viem";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import { trackSwiftSaveEvent } from "@/lib/save/analytics";
import { swiftSaveVaultAddress } from "@/lib/save/config";
import { readIdempotencyKey } from "@/lib/save/idempotency";
import { pocketIdToBytes32 } from "@/lib/save/pocket-id";
import {
  confirmSavingsTransaction,
  failSavingsTransaction,
  getOrCreatePendingTransaction,
  getPocketForOwner,
  readSavingsSupabaseError,
} from "@/lib/save/service";
import {
  isValidTxHash,
  isValidUuid,
  normalizeAmount,
  normalizeIdempotencyKey,
} from "@/lib/save/validation";
import { arcTestnetTokens } from "@/lib/tokens";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/**
 * Flat deposit route (avoids Turbopack nested [id] 404s).
 * POST body: { ownerWallet, pocketId, amount, ... }
 * PUT body: { ownerWallet, pocketId, transactionId, txHash }
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

  if (typeof body.pocketId !== "string" || !isValidUuid(body.pocketId)) {
    return jsonError("A valid pocketId is required.", 400);
  }
  const pocketId = body.pocketId;

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before depositing.", 401);
  }

  try {
    const pocket = await getPocketForOwner(pocketId, ownerWallet);
    if (!pocket) {
      return jsonError("Savings pocket not found.", 404);
    }
    if (pocket.status !== "active") {
      return jsonError("Cannot deposit into an archived pocket.", 400);
    }

    const amount = normalizeAmount(body.amount, pocket.currency);
    if (!amount) {
      return jsonError("Enter a valid deposit amount greater than zero.", 400);
    }

    const idempotencyKey =
      readIdempotencyKey(request, body) ??
      normalizeIdempotencyKey(body.idempotencyKey) ??
      `deposit:${pocketId}:${ownerWallet}:${amount.amount_units}:${randomUUID()}`;

    trackSwiftSaveEvent("swift_save_deposit_started", {
      pocketId,
      currency: pocket.currency,
    });

    const transaction = await getOrCreatePendingTransaction({
      ownerWallet,
      pocketId,
      type: "DEPOSIT",
      amount: amount.amount,
      amountUnits: amount.amount_units,
      currency: pocket.currency,
      idempotencyKey,
      metadata: {
        source: body.source === "initial" ? "initial" : "manual",
      },
    });

    const vault = swiftSaveVaultAddress();
    const token = arcTestnetTokens[pocket.currency];

    return NextResponse.json(
      {
        transaction,
        vaultAddress: vault,
        pocketIdBytes32: pocketIdToBytes32(pocketId),
        tokenAddress: token.address,
        amountUnits: amount.amount_units,
        requiresVault: Boolean(vault),
        message: vault
          ? "Approve the vault (if needed), call deposit, then confirm with the transaction hash."
          : "Deploy SwiftSaveVault and set NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS to enable on-chain deposits.",
      },
      { status: transaction.status === "PENDING" ? 201 : 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Deposit could not be prepared.");
    return jsonError(message, 500);
  }
}

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

  if (typeof body.pocketId !== "string" || !isValidUuid(body.pocketId)) {
    return jsonError("A valid pocketId is required.", 400);
  }
  const pocketId = body.pocketId;

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before confirming deposits.", 401);
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
    const pocket = await getPocketForOwner(pocketId, ownerWallet);
    if (!pocket) {
      return jsonError("Savings pocket not found.", 404);
    }

    const result = await confirmSavingsTransaction({
      transactionId: body.transactionId,
      ownerWallet,
      txHash: body.txHash as Hash,
      direction: "deposit",
    });

    if (result.transaction.pocket_id !== pocketId) {
      return jsonError("Transaction does not belong to this pocket.", 400);
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Deposit could not be confirmed.");

    if (
      typeof body.transactionId === "string" &&
      isValidUuid(body.transactionId) &&
      !message.includes("reconciliation")
    ) {
      try {
        await failSavingsTransaction(body.transactionId, ownerWallet, message);
      } catch {
        // ignore
      }
    }

    const status = message.includes("reverted")
      ? 400
      : message.includes("not found")
        ? 404
        : 500;
    return jsonError(message, status);
  }
}
