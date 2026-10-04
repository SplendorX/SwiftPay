/**
 * Account activity: every confirmed transaction the account made, labelled with
 * the SwiftPay feature that performed it. Shared by the /api/activity route and
 * the dashboard, so it stays free of server-only imports.
 */

export const activitySources = [
  "send",
  "request",
  "payroll",
  "circle",
  "swap",
  "invoice",
  "save",
  "earn",
  "batch",
  "recurepay",
  "agent",
  "points",
  "checkout",
] as const;

export type ActivitySource = (typeof activitySources)[number];

/** Feature sources plus "wallet": on-chain transfers no feature claimed. */
export type ActivityFeed = ActivitySource | "wallet";

export type ActivityDirection = "in" | "out" | "internal";

export type ActivityBatchRecipient = {
  wallet: string;
  amount: string;
  /** @username or the name entered in the composer, when there was one. */
  label: string | null;
};

export type ActivityBatchDetails = {
  recipients: ActivityBatchRecipient[];
  fee: string | null;
  mode: string | null;
  /** "payroll" for a payroll run; a BatchPay batch otherwise. */
  kind?: "batch" | "payroll";
  /** The payroll run's name, for its receipt. */
  name?: string | null;
};

export type AccountActivityEntry = {
  id: string;
  source: ActivityFeed;
  direction: ActivityDirection;
  title: string;
  counterparty: string | null;
  /** Decimal string, e.g. "12.5". */
  amount: string | null;
  token: string | null;
  /** Second leg of a swap, e.g. the EURC received for USDC sent. */
  amountIn?: string | null;
  tokenIn?: string | null;
  /** BatchPay: everyone the batch paid, so the receipt can name them. */
  batch?: ActivityBatchDetails | null;
  /** Every on-chain transaction this activity produced. */
  txHashes: string[];
  occurredAt: string | null;
  /** Only labels a matching on-chain transfer; never listed on its own. */
  mirrored?: boolean;
};

export function isActivitySource(value: unknown): value is ActivitySource {
  return (
    typeof value === "string" &&
    (activitySources as readonly string[]).includes(value)
  );
}

export const activityFeatureMeta: Record<
  ActivityFeed,
  { label: string; href: string | null }
> = {
  send: { label: "Send Payment", href: "/send" },
  request: { label: "Request Payment", href: "/pay" },
  payroll: { label: "Payroll", href: "/business/payroll" },
  circle: { label: "Circle", href: "/circle" },
  swap: { label: "Swap", href: "/swap" },
  invoice: { label: "Invoices", href: "/business/invoices" },
  save: { label: "Save", href: "/save" },
  earn: { label: "Earn", href: "/earn" },
  batch: { label: "BatchPay", href: "/batchpay" },
  recurepay: { label: "RecurePay", href: "/recurepay" },
  // ALLIE lives in the Pay with ALLIE bubble, opened from Activity directly.
  agent: { label: "ALLIE", href: null },
  points: { label: "SwiftPoints", href: "/referral" },
  // In-person payments to a business through SwiftPay Checkout.
  checkout: { label: "Checkout", href: null },
  wallet: { label: "Wallet", href: null },
};
