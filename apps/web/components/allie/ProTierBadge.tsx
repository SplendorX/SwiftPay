"use client";

import { Crown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Marks a reply ALLIE Pro's language model produced (Tier 2 or 3), so a Pro
 * user can tell it apart from the free, rule-based Tier 1 — and see when it
 * cost SwiftPoints past the day's included requests.
 */
export function ProTierBadge({
  className,
  overagePoints,
}: {
  className?: string;
  overagePoints?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.68rem] font-semibold text-primary",
        className,
      )}
      title={
        overagePoints
          ? `Handled by ALLIE Pro's language model. Past today's included requests, so it cost ${overagePoints} SwiftPoints.`
          : "Handled by ALLIE Pro's language model, not the free tier."
      }
    >
      <Crown aria-hidden className="h-3 w-3" />
      ALLIE Pro
      {overagePoints ? (
        <span className="font-medium opacity-80">· {overagePoints} pts</span>
      ) : null}
    </span>
  );
}

/** True when the reply came from the language model, not Tier 1 rules. */
export function isProTier(tier: number | undefined) {
  return (tier ?? 1) >= 2;
}
