"use client";

import { CheckCircle, Clock } from "lucide-react";
import type { LiquiditySummaryData } from "./types";

type LiquiditySummaryProps = {
  data: LiquiditySummaryData;
};

export function LiquiditySummary({ data }: LiquiditySummaryProps) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-muted/30 p-4 sm:p-5 lg:h-full">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Liquidity & Allocation
      </div>

      <div className="mt-4 space-y-4">
        {/* Available to Spend */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Available to Spend
            </div>
            <div className="font-heading text-lg sm:text-xl font-bold text-foreground">
              {data.availableToSpendFormatted}
            </div>
            <p className="text-xs text-muted-foreground/90">
              Ready for payments and transfers
            </p>
          </div>
        </div>

        <div className="h-px w-full bg-border/60" />

        {/* Scheduled & Reserved */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Scheduled & Reserved
            </div>
            <div className="font-heading text-lg sm:text-xl font-bold text-foreground">
              {data.scheduledAndReservedFormatted}
            </div>
            <p className="text-xs text-muted-foreground/90">
              Upcoming payments and allocations
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
