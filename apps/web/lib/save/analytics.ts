/**
 * Internal analytics for Swift+Save.
 * Never logs full balances, private keys, or raw wallet secrets.
 */

export type SwiftSaveAnalyticsEvent =
  | "swift_save_pocket_created"
  | "swift_save_deposit_started"
  | "swift_save_deposit_completed"
  | "swift_save_withdrawal_started"
  | "swift_save_withdrawal_completed"
  | "swift_save_target_reached"
  | "spend_save_enabled"
  | "spend_save_disabled"
  | "spend_save_paused"
  | "spend_save_payment_triggered"
  | "spend_save_completed"
  | "spend_save_failed";

export type AnalyticsProps = {
  pocketId?: string;
  currency?: string;
  status?: string;
  /** Non-sensitive flags only */
  hasTarget?: boolean;
  percentageBucket?: string;
};

function percentageBucket(pct: string | number | undefined) {
  if (pct === undefined || pct === null) return undefined;
  const n = typeof pct === "number" ? pct : Number(pct);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 2) return "1-2";
  if (n <= 5) return "3-5";
  if (n <= 10) return "6-10";
  return "11-50";
}

export function trackSwiftSaveEvent(
  event: SwiftSaveAnalyticsEvent,
  props: AnalyticsProps = {},
) {
  const payload = {
    event,
    ts: new Date().toISOString(),
    pocketId: props.pocketId ? props.pocketId.slice(0, 8) : undefined,
    currency: props.currency,
    status: props.status,
    hasTarget: props.hasTarget,
    percentageBucket: props.percentageBucket,
  };

  // Structured log for server/ops; client can no-op or forward later.
  if (typeof console !== "undefined") {
    console.info("[swift-save-analytics]", JSON.stringify(payload));
  }

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("swiftpay:analytics", { detail: payload }),
      );
    } catch {
      // ignore
    }
  }
}

export function trackSpendSavePercent(
  event: SwiftSaveAnalyticsEvent,
  percentage: string | number,
  extra: AnalyticsProps = {},
) {
  trackSwiftSaveEvent(event, {
    ...extra,
    percentageBucket: percentageBucket(percentage),
  });
}
