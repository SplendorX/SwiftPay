import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { circleDb, circleTables, isDuplicateError } from "@/lib/swift-circle/db";
import { confirmPaymentFromWebhook } from "@/lib/swift-circle/payments";
import { confirmSaveContributionFromTx } from "@/lib/swift-circle/save";
import { confirmEarnContributionFromTx } from "@/lib/swift-circle/earn";
import { confirmWithdrawalFromTx } from "@/lib/swift-circle/withdrawals";
import { logCircleEvent } from "@/lib/swift-circle/logging";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function verifyCircleWebhookSignature(rawBody: string, request: NextRequest) {
  const secret = process.env.CIRCLE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header =
    request.headers.get("x-circle-signature") ??
    request.headers.get("x-circle-key-id") ??
    request.headers.get("authorization");
  if (!header) return false;
  if (header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length) === secret;
  }
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = header.replace(/^sha256=/i, "");
  const a = Buffer.from(digest);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function extractWebhookConfirmation(payload: Record<string, unknown>) {
  const notification = asRecord(payload.notification) ?? payload;
  const tx = asRecord(notification.transaction) ?? notification;
  const state = (
    readString(notification.state) ??
    readString(tx.state) ??
    readString(payload.notificationType) ??
    ""
  ).toUpperCase();
  const txHash =
    readString(tx.txHash) ??
    readString(tx.transactionHash) ??
    readString(notification.txHash);
  const providerTransactionId =
    readString(tx.id) ??
    readString(notification.id) ??
    readString(tx.transactionId);
  const providerEventId =
    readString(payload.id) ??
    readString(notification.notificationId) ??
    providerTransactionId ??
    txHash;
  const success =
    state.includes("COMPLETE") ||
    state.includes("CONFIRMED") ||
    state === "SUCCESS";
  const failed =
    state.includes("FAIL") ||
    state.includes("DENIED") ||
    state.includes("CANCEL");
  return { failed, providerEventId, providerTransactionId, success, txHash };
}

export async function processCircleWebhook(payload: Record<string, unknown>) {
  const extracted = extractWebhookConfirmation(payload);
  if (!extracted.providerEventId) {
    return { ok: true, ignored: true };
  }
  const supabase = circleDb();
  const { error } = await supabase.from(circleTables.webhooks).insert({
    provider_event_id: extracted.providerEventId,
    tx_hash: extracted.txHash ? extracted.txHash.toLowerCase() : null,
    provider_transaction_id: extracted.providerTransactionId,
    payload,
  });
  const isDuplicate = Boolean(error && isDuplicateError(error));
  if (error && !isDuplicate) {
    throw new Error(error.message);
  }
  if (isDuplicate) {
    logCircleEvent({
      operation: "webhook.duplicate",
      status: "retry",
      extra: { providerEventId: extracted.providerEventId },
    });
  }
  if (!extracted.success || !extracted.txHash) {
    return { ok: true, ignored: true, duplicate: isDuplicate };
  }
  const hash = extracted.txHash.toLowerCase();
  const results = await Promise.all([
    confirmPaymentFromWebhook({
      txHash: hash,
      providerTransactionId: extracted.providerTransactionId,
    }),
    confirmSaveContributionFromTx(hash),
    confirmEarnContributionFromTx(hash),
    confirmWithdrawalFromTx(hash),
  ]);
  logCircleEvent({
    operation: "webhook.processed",
    status: "confirmed",
    transactionId: hash,
  });
  return { ok: true, matched: results.some(Boolean), duplicate: isDuplicate };
}
