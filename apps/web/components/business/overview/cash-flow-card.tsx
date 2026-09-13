"use client";

import { useState } from "react";
import { CashFlowChart } from "./cash-flow-chart";
import type { CashFlowPeriod, CashFlowSummary } from "./types";

type CashFlowCardProps = {
  initialPeriod?: CashFlowPeriod;
  summariesByPeriod: Record<CashFlowPeriod, CashFlowSummary>;
};

const PERIODS: { label: string; value: CashFlowPeriod }[] = [
  { label: "7D", value: "7D" },
  { label: "30D", value: "30D" },
  { label: "3M", value: "3M" },
  { label: "1Y", value: "1Y" },
];

export function CashFlowCard({
  initialPeriod = "30D",
  summariesByPeriod,
}: CashFlowCardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<CashFlowPeriod>(initialPeriod);

  const currentSummary = summariesByPeriod[selectedPeriod] || summariesByPeriod["30D"];
  const isNetPositive = currentSummary.netFlow >= 0;

  return (
    <section className="min-h-[400px] rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Cash Flow
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            Track how money moves through your business.
          </p>
        </div>

        {/* Time Filter Segmented Control */}
        <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 self-start sm:self-auto">
          {PERIODS.map((p) => {
            const isActive = selectedPeriod === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setSelectedPeriod(p.value)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary Stat Row */}
      <div className="mt-6 flex flex-wrap items-center gap-6 sm:gap-10 border-b border-border/70 pb-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-3 w-3 rounded-full bg-emerald-500 shadow-xs" />
          <div>
            <span className="text-xs text-muted-foreground">Incoming</span>
            <div className="font-heading text-lg sm:text-xl font-bold text-foreground">
              {currentSummary.incomingTotalFormatted}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="flex h-3 w-3 rounded-full bg-[#8B5CF6] shadow-xs" />
          <div>
            <span className="text-xs text-muted-foreground">Outgoing</span>
            <div className="font-heading text-lg sm:text-xl font-bold text-foreground">
              {currentSummary.outgoingTotalFormatted}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:ml-auto">
          <span className="text-xs text-muted-foreground">Net Flow:</span>
          <span
            className={`font-heading text-lg sm:text-xl font-bold ${
              isNetPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {isNetPositive ? "+" : ""}
            {currentSummary.netFlowFormatted}
          </span>
        </div>
      </div>

      {/* Interactive Dual Curve SVG Chart */}
      <div className="mt-6">
        <CashFlowChart points={currentSummary.points} />
      </div>
    </section>
  );
}
