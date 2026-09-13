"use client";

import { Activity } from "lucide-react";
import { BusinessHealthIndicator } from "./business-health-indicator";
import type { BusinessFinancialHealthData } from "./types";

type BusinessHealthCardProps = {
  data: BusinessFinancialHealthData;
};

export function BusinessHealthCard({ data }: BusinessHealthCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
      {/* Header */}
      <div className="flex items-center gap-2 pb-5 border-b border-border/70">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground">
            Business Financial Health
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            A quick summary of your current financial position.
          </p>
        </div>
      </div>

      {/* 4-Column Grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.indicators.map((indicator) => (
          <BusinessHealthIndicator key={indicator.id} indicator={indicator} />
        ))}
      </div>
    </section>
  );
}
