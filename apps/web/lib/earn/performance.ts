/**
 * User-level Earn performance helpers.
 * Uses bigint + decimal strings only — never JS floats for accounting.
 */

import {
  formatUnitsToDecimal,
  parseDecimalToUnits,
} from "@/lib/earn/decimal";

export type EarnHistoryEvent = {
  type: "deposit" | "withdrawal";
  assets: string;
  shares?: string;
  timestamp?: string | null;
  created_at?: string | null;
  tx_hash?: string | null;
};

export type EarnPerformanceSummary = {
  /** Sum of deposit assets (decimal string, USDC). */
  totalDeposited: string;
  /** Sum of withdrawal assets (decimal string). */
  totalWithdrawn: string;
  /**
   * Net principal still in vault from indexed flows:
   * max(0, totalDeposited - totalWithdrawn).
   */
  netPrincipal: string;
  /** Current vault position value (assets) as decimal string. */
  currentValue: string;
  /**
   * Estimated earned = max(0, currentValue - netPrincipal).
   * Not exact if fees, partial withdrawals, or incomplete indexing.
   */
  totalEarned: string;
  /** Estimated gross yield before performance fee (from net + fee rate). */
  estimatedGrossYield: string;
  /** Estimated SwiftPay fee share of yield (decimal string). */
  estimatedFee: string;
  /** Whether summary has enough indexed history to be meaningful. */
  hasHistory: boolean;
  /** Human note when numbers are estimates. */
  note: string;
};

function eventTime(event: EarnHistoryEvent): number {
  const raw = event.timestamp || event.created_at;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function safeUnits(value: string | undefined, decimals: number): bigint {
  if (!value?.trim()) return 0n;
  try {
    return parseDecimalToUnits(value, decimals);
  } catch {
    // Indexed rows store plain decimal or raw integer strings
    try {
      if (/^\d+$/.test(value.trim())) {
        return BigInt(value.trim());
      }
    } catch {
      /* ignore */
    }
    return 0n;
  }
}

/**
 * Compute performance from indexed deposit/withdraw events + live position.
 * Backend events are analytics only; on-chain convertToAssets is source of truth for current value.
 */
export function computeEarnPerformance(params: {
  events: EarnHistoryEvent[];
  /** Live position assets (USDC base units). */
  currentValueUnits: bigint;
  decimals?: number;
  /** Performance fee in BPS (e.g. 1000 = 10%). */
  performanceFeeBps?: number;
}): EarnPerformanceSummary {
  const decimals = params.decimals ?? 6;
  const feeBps = Math.min(
    Math.max(0, Math.trunc(params.performanceFeeBps ?? 1000)),
    2000,
  );

  let deposited = 0n;
  let withdrawn = 0n;

  for (const event of params.events) {
    const amount = safeUnits(event.assets, decimals);
    if (event.type === "deposit") {
      deposited += amount;
    } else if (event.type === "withdrawal") {
      withdrawn += amount;
    }
  }

  const netPrincipal =
    deposited > withdrawn ? deposited - withdrawn : 0n;
  const current = params.currentValueUnits;
  const earned =
    current > netPrincipal && params.events.length > 0
      ? current - netPrincipal
      : 0n;

  // If net is user yield after fee share minting, reverse-estimate gross and fee.
  // fee = gross * bps / 10000; net = gross - fee => gross = net * 10000 / (10000 - bps)
  let estimatedGross = earned;
  let estimatedFee = 0n;
  if (earned > 0n && feeBps > 0 && feeBps < 10_000) {
    const denom = BigInt(10_000 - feeBps);
    estimatedGross = (earned * 10_000n) / denom;
    estimatedFee = estimatedGross > earned ? estimatedGross - earned : 0n;
  }

  const hasHistory = params.events.length > 0;

  return {
    totalDeposited: formatUnitsToDecimal(deposited, decimals),
    totalWithdrawn: formatUnitsToDecimal(withdrawn, decimals),
    netPrincipal: formatUnitsToDecimal(netPrincipal, decimals),
    currentValue: formatUnitsToDecimal(current, decimals),
    totalEarned: formatUnitsToDecimal(earned, decimals),
    estimatedGrossYield: formatUnitsToDecimal(estimatedGross, decimals),
    estimatedFee: formatUnitsToDecimal(estimatedFee, decimals),
    hasHistory,
    note: hasHistory
      ? "Earned is estimated from indexed deposits/withdrawals vs current on-chain value. Not a guarantee of future yield."
      : "Building your earnings history… Deposit activity is indexed from on-chain events.",
  };
}

export type PortfolioChartPoint = {
  /** ISO timestamp */
  at: string;
  /** Label for axis (e.g. Mon, or short date) */
  label: string;
  /** Decimal string USDC */
  value: string;
  /** Kind of point */
  kind: "deposit" | "withdrawal" | "current";
};

/**
 * Build a sparse portfolio series from real events only.
 * Does not invent intermediate yield points.
 * Appends live current value as the latest point when provided.
 */
export function buildPortfolioSeries(params: {
  events: EarnHistoryEvent[];
  currentValueUnits?: bigint;
  decimals?: number;
  now?: Date;
}): PortfolioChartPoint[] {
  const decimals = params.decimals ?? 6;
  const sorted = [...params.events].sort(
    (a, b) => eventTime(a) - eventTime(b),
  );

  let running = 0n;
  const points: PortfolioChartPoint[] = [];

  for (const event of sorted) {
    const amount = safeUnits(event.assets, decimals);
    if (event.type === "deposit") {
      running += amount;
    } else {
      running = running > amount ? running - amount : 0n;
    }
    const at =
      event.timestamp ||
      event.created_at ||
      new Date(eventTime(event) || Date.now()).toISOString();
    points.push({
      at,
      label: formatChartLabel(at),
      value: formatUnitsToDecimal(running, decimals),
      kind: event.type === "deposit" ? "deposit" : "withdrawal",
    });
  }

  // Only append live value when we have real flow history or a non-zero position.
  if (
    params.currentValueUnits !== undefined &&
    (points.length > 0 || params.currentValueUnits > 0n)
  ) {
    const now = (params.now ?? new Date()).toISOString();
    points.push({
      at: now,
      label: "Now",
      value: formatUnitsToDecimal(params.currentValueUnits, decimals),
      kind: "current",
    });
  }

  return points;
}

function formatChartLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Format a decimal string as $X,XXX.XX for display (display only). */
export function formatUsdDisplay(decimal: string | undefined | null): string {
  if (decimal === undefined || decimal === null || decimal === "") return "—";
  const neg = decimal.startsWith("-");
  const raw = neg ? decimal.slice(1) : decimal;
  const [wholePart, fracPart = ""] = raw.split(".");
  const whole = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (fracPart + "00").slice(0, 2);
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
