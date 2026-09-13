"use client";

import { Sparkles } from "lucide-react";
import { BusinessInsightItem } from "./business-insight-item";
import type { BusinessInsightItemData } from "./types";

type BusinessInsightsCardProps = {
  insights: BusinessInsightItemData[];
};

export function BusinessInsightsCard({ insights }: BusinessInsightsCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div>
        {/* Header */}
        <div className="flex items-center gap-2 pb-4 border-b border-border/70">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-[#5B21B6] dark:text-purple-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground">
              Business Insights
            </h2>
            <p className="text-xs text-muted-foreground">
              A quick view of what needs your attention.
            </p>
          </div>
        </div>

        {/* List of insights */}
        <div className="mt-4 space-y-3">
          {insights.map((insight) => (
            <BusinessInsightItem key={insight.id} insight={insight} />
          ))}
        </div>
      </div>
    </div>
  );
}
