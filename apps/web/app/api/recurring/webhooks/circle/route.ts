import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { applyProviderConfirmation } from "@/lib/recurring/reconciliation";
import { logRecurringEvent } from "@/lib/recurring/logging";
import { processCircleWebhook } from "@/lib/swift-circle/webhooks";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function verifyWebhookSignature(rawBody: string, request: NextRequest) {
  const secret = process.env.CIRCLE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const header =
    request.headers.get("x-circle-signature") ??
    request.headers.get("x-circle-key-id") ??
    request.headers.get("authorization");

  if (!header) {
    return false;
  }

  if (header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length) === secret;
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = header.replace(/^sha256=/i, "");
  const a = Buffer.from(digest);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function extractConfirmation(payload: Record<string, unknown>) {
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
  const success =
    state.includes("COMPLETE") ||
    state.includes("CONFIRMED") ||
    state === "SUCCESS";
  const failed =
    state.includes("FAIL") ||
    state.includes("DENIED") ||
    state.includes("CANCEL");

  return { failed, providerTransactionId, success, txHash };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request)) {
    return jsonError("Invalid webhook signature.", 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON payload.", 400);
  }

  const confirmation = extractConfirmation(payload);
  if (!confirmation.success && !confirmation.failed) {
    return NextResponse.json({ ignored: true, ok: true });
  }

  if (!confirmation.txHash && !confirmation.providerTransactionId) {
    return NextResponse.json({ ignored: true, ok: true });
  }

  try {
    const result = await applyProviderConfirmation({
      providerTransactionId: confirmation.providerTransactionId,
      success: confirmation.success && !confirmation.failed,
      txHash: confirmation.txHash,
    });
    logRecurringEvent("recurring.webhook", {
      applied: result.applied,
      providerTransactionId: confirmation.providerTransactionId,
      reason: "reason" in result ? result.reason : undefined,
    });
    const circleResult = await processCircleWebhook(payload).catch((error) => {
      console.warn(
        "[swift-circle-webhook]",
        error instanceof Error ? error.message : "circle webhook failed",
      );
      return { ok: false };
    });
    return NextResponse.json({ ok: true, ...result, circle: circleResult });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed.";
    return jsonError(message, 500);
  }
}
