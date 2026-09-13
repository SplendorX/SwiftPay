"use client";

import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import type { BusinessHealthIndicatorData } from "./types";

type BusinessHealthIndicatorProps = {
  indicator: BusinessHealthIndicatorData;
};

export function BusinessHealthIndicator({
  indicator,
}: BusinessHealthIndicatorProps) {
  const getToneStyle = () => {
    switch (indicator.tone) {
      case "positive":
        return {
          pill: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
        };
      case "warning":
        return {
          pill: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          icon: <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
        };
      default:
        return {
          pill: "border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400",
          icon: <Info className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />,
        };
    }
  };

  const style = getToneStyle();

  return (
    <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-muted/20 p-5 transition-all hover:bg-muted/40">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {indicator.label}
          </span>
          <div
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.pill}`}
          >
            {style.icon}
            <span>{indicator.status}</span>
          </div>
        </div>

        {indicator.statusCount && (
          <div className="mt-2 font-heading text-lg font-bold text-foreground">
            {indicator.statusCount}
          </div>
        )}

        <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {indicator.description}
        </p>
      </div>
    </div>
  );
}
