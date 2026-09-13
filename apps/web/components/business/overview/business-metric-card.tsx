"use client";

import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react";
import type { BusinessMetricItem } from "./types";

type BusinessMetricCardProps = {
  metric: BusinessMetricItem;
};

export function BusinessMetricCard({ metric }: BusinessMetricCardProps) {
  const content = (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-border/80 hover:shadow-xs group">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {metric.title}
          </span>
          {metric.href && (
            <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          )}
        </div>
        <div className="mt-2 font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {metric.valueFormatted}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 pt-1">
        {metric.trend && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold ${
              metric.trendPositive
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
            }`}
          >
            {metric.trendPositive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {metric.trend}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{metric.subtitle}</span>
      </div>
    </div>
  );

  if (metric.href) {
    return <Link href={metric.href}>{content}</Link>;
  }

  return content;
}
