import { createSavingsNotificationResult } from "@/lib/save/notifications";

export async function notifyRecurringFailure(input: {
  amount: string;
  ownerWallet: string;
  reason: string;
  relatedTxHash?: string | null;
  scheduleId: string;
  tokenSymbol: string;
}) {
  const insufficient = /insufficient/i.test(input.reason);
  return createSavingsNotificationResult({
    body: insufficient
      ? `A ${input.amount} ${input.tokenSymbol} Autopay could not be sent because the wallet balance is too low. It will retry with backoff.`
      : `A ${input.amount} ${input.tokenSymbol} Autopay failed: ${input.reason.slice(0, 180)}`,
    fallbackKind: "reconciliation_alert",
    kind: "reconciliation_alert",
    metadata: {
      reason: input.reason.slice(0, 280),
      scheduleId: input.scheduleId,
      source: "recurring",
    },
    ownerWallet: input.ownerWallet,
    relatedTxHash: input.relatedTxHash ?? null,
    title: insufficient ? "Autopay needs funds" : "Autopay payment failed",
  });
}

export async function notifyRecurringCompleted(input: {
  amount: string;
  ownerWallet: string;
  scheduleId: string;
  tokenSymbol: string;
  txHash?: string | null;
}) {
  return createSavingsNotificationResult({
    body: `${input.amount} ${input.tokenSymbol} was sent automatically by Autopay.`,
    fallbackKind: "payment_received",
    kind: "payment_received",
    metadata: {
      scheduleId: input.scheduleId,
      source: "recurring",
    },
    ownerWallet: input.ownerWallet,
    relatedTxHash: input.txHash ?? null,
    title: "Autopay sent",
  });
}
