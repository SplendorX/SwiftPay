"use client";

import Link from "next/link";
import { TrendingUp, AlertTriangle, Calendar, ArrowRight } from "lucide-react";
import type { BusinessInsightItemData } from "./types";

type BusinessInsightItemProps = {
  insight: BusinessInsightItemData;
};

export function BusinessInsightItem({ insight }: BusinessInsightItemProps) {
  const getIcon = () => {
    switch (insight.type) {
      case "growth":
        return <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case "attention":
        return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      case "upcoming":
        return <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
      default:
        return <TrendingUp className="h-4 w-4 text-emerald-600" />;
    }
  };

  const getBorderColor = () => {
    switch (insight.type) {
      case "growth":
        return "border-emerald-500/20 bg-emerald-500/[0.03]";
      case "attention":
        return "border-amber-500/20 bg-amber-500/[0.03]";
      case "upcoming":
        return "border-purple-500/20 bg-purple-500/[0.03]";
      default:
        return "border-border bg-card";
    }
  };

  return (
    <div
      className={`flex flex-col justify-between rounded-xl border p-4 transition-all hover:border-border/80 ${getBorderColor()}`}
    >
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-background shadow-2xs">
            {getIcon()}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            {insight.title}
          </span>
        </div>
        <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {insight.description}
        </p>
      </div>

      {insight.href && (
        <div className="mt-3 pt-2">
          <Link
            href={insight.href}
            className="group inline-flex items-center gap-1 text-xs font-semibold text-[#5B21B6] hover:text-[#4C1D95] dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
          >
            <span>Take action</span>
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
