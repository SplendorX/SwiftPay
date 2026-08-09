"use client";

import type { EarnPerformanceSummary } from "@/lib/earn/performance";
import { formatUsdDisplay } from "@/lib/earn/performance";

type PerformanceCardProps = {
  summary: EarnPerformanceSummary | null;
  netApyDisplay: string;
  underlyingApyDisplay: string;
  feePercent: number;
  strategyName: string;
  strategyHealthy: boolean | undefined;
  mode: "live" | "simulation" | "unavailable";
};

export function PerformanceCard({
  summary,
  netApyDisplay,
  underlyingApyDisplay,
  feePercent,
  strategyName,
  strategyHealthy,
  mode,
}: PerformanceCardProps) {
  const earned = summary?.totalEarned ?? "0";
  const earnedPositive =
    summary?.hasHistory && earned !== "0" && !earned.startsWith("-");

  return (
    <article className="earn-performance-card">
      <h2>Performance</h2>
      <dl className="earn-dl">
        <div>
          <dt>Total deposited</dt>
          <dd>
            {summary?.hasHistory
              ? `$${formatUsdDisplay(summary.totalDeposited)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Current value</dt>
          <dd>${formatUsdDisplay(summary?.currentValue ?? "0")}</dd>
        </div>
        <div>
          <dt>Total earned</dt>
          <dd className={earnedPositive ? "earn-earned-positive" : undefined}>
            {summary?.hasHistory
              ? `${earnedPositive ? "+" : ""}$${formatUsdDisplay(earned)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Net APY</dt>
          <dd>{netApyDisplay}</dd>
        </div>
        <div>
          <dt>Underlying yield (gross)</dt>
          <dd>{underlyingApyDisplay}</dd>
        </div>
        <div>
          <dt>SwiftPay fee</dt>
          <dd>
            {feePercent}% of yield
            {summary?.hasHistory && summary.estimatedFee !== "0" ? (
              <span className="earn-fee-detail">
                {" "}
                · ~${formatUsdDisplay(summary.estimatedFee)} est.
              </span>
            ) : null}
          </dd>
        </div>
        {summary?.hasHistory && summary.estimatedGrossYield !== "0" ? (
          <div>
            <dt>Gross yield (est.)</dt>
            <dd>${formatUsdDisplay(summary.estimatedGrossYield)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Underlying strategy</dt>
          <dd>{strategyName}</dd>
        </div>
        <div>
          <dt>Strategy health</dt>
          <dd>
            {strategyHealthy === undefined
              ? "—"
              : strategyHealthy
                ? "Healthy"
                : "Unhealthy"}
          </dd>
        </div>
      </dl>

      <div className="earn-yield-split">
        <div>
          <p className="earn-stat-label">Gross protocol yield</p>
          <p className="earn-stat-value">{underlyingApyDisplay}</p>
        </div>
        <div className="earn-yield-arrow" aria-hidden>
          →
        </div>
        <div>
          <p className="earn-stat-label">Net user yield</p>
          <p className="earn-stat-value">{netApyDisplay}</p>
        </div>
      </div>

      <p className="earn-footnote">
        {mode === "simulation"
          ? "Simulation — not real yield. Figures do not represent economic returns."
          : summary?.note ??
            "SwiftPay takes a performance fee only on positive yield above the vault high-water mark — never on deposits."}
      </p>
    </article>
  );
}
