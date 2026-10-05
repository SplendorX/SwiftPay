import { type NextRequest } from "next/server";

import { listAccountActivity, recordAccountActivity } from "@/lib/activity/service";
import { swiftBatchMaxRecipients } from "@/lib/contracts";
import { activityWindowStart, clampActivityDays, isActivitySource } from "@/lib/activity/types";
import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { assertRecurringAccess, normalizeOwnerWallet } from "@/lib/recurring-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const ownerWallet = normalizeOwnerWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid: request.nextUrl.searchParams.get("circleSocialUuid"),
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before loading activity.", 401);
  }

  try {
    // 30 days by default, up to three months (Transaction History); older
    // entries are in statements.
    const days = clampActivityDays(request.nextUrl.searchParams.get("days"));
    return jsonOk({
      entries: await listAccountActivity(ownerWallet, { from: activityWindowStart(Date.now(), days) }),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Activity could not be loaded.",
      500,
    );
  }
}

function text(value: unknown, max = 160) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function decimal(value: unknown) {
  const raw = typeof value === "number" ? String(value) : text(value, 40);
  return raw && /^\d+(\.\d+)?$/.test(raw) ? raw : null;
}

export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.walletAddress);
  if (!ownerWallet) {
    return jsonError("A valid wallet address is required.", 400);
  }
  if (!isActivitySource(body.source)) {
    return jsonError("A valid activity source is required.", 400);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before recording activity.", 401);
  }

  const txHash = text(body.txHash, 66);
  if (txHash && !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return jsonError("A valid transaction hash is required.", 400);
  }

  const direction =
    body.direction === "in" || body.direction === "internal"
      ? body.direction
      : "out";
  const amount = decimal(body.amount);
  const token = text(body.token, 12)?.toUpperCase() ?? null;
  const metadata: Record<string, unknown> = {};
  // BulkPay keeps who was paid, so the receipt can be rebuilt later.
  if (body.source === "batch" && Array.isArray(body.recipients)) {
    const recipients = body.recipients.slice(0, swiftBatchMaxRecipients).flatMap((entry) => {
      const item = entry as Record<string, unknown> | null;
      const wallet = normalizeOwnerWallet(item?.wallet);
      const recipientAmount = decimal(item?.amount);
      return wallet && recipientAmount
        ? [{ amount: recipientAmount, label: text(item?.label, 60), wallet }]
        : [];
    });
    if (recipients.length > 0) {
      metadata.recipients = recipients;
      metadata.fee = text(body.fee, 40);
      metadata.mode = text(body.mode, 40);
    }
  }
  const amountIn = decimal(body.amountIn);
  const tokenIn = text(body.tokenIn, 12)?.toUpperCase();
  if (amountIn && tokenIn) {
    metadata.amountIn = amountIn;
    metadata.tokenIn = tokenIn;
  }

  try {
    await recordAccountActivity({
      amount,
      counterparty: text(body.counterparty),
      direction,
      metadata,
      source: body.source,
      title: text(body.title),
      token,
      txHash,
      walletAddress: ownerWallet,
    });

    // The requester of a paid request sees the incoming transfer labelled
    // too. Mirrored rows only ever label a transfer already on their chain
    // history, so a forged one cannot invent activity.
    const counterpartyWallet = normalizeOwnerWallet(body.counterpartyWallet);
    if (
      body.source === "request" &&
      txHash &&
      counterpartyWallet &&
      counterpartyWallet !== ownerWallet
    ) {
      await recordAccountActivity({
        amount,
        counterparty: ownerWallet,
        direction: "in",
        mirrored: true,
        source: "request",
        title: "Payment request paid",
        token,
        txHash,
        walletAddress: counterpartyWallet,
      });
    }

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Activity could not be recorded.",
      500,
    );
  }
}
