"use client";

import { Award, Compass, Crown, ShieldCheck } from "lucide-react";
import type { ReferralTier } from "@/lib/referral/types";
import { cn } from "@/lib/utils";

interface TierBadgeProps {
  tier: ReferralTier;
  className?: string;
  showIcon?: boolean;
}

const tierConfig: Record<
  ReferralTier,
  { label: string; bg: string; text: string; border: string; icon: typeof Award }
> = {
  STARTER: {
    label: "Starter",
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300/40 dark:border-blue-700/50",
    icon: Compass,
  },
  BUILDER: {
    label: "Builder",
    bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300/40 dark:border-emerald-700/50",
    icon: ShieldCheck,
  },
  ARCHITECT: {
    label: "Architect",
    bg: "bg-purple-500/10 dark:bg-purple-500/20",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-300/40 dark:border-purple-700/50",
    icon: Crown,
  },
  AMBASSADOR: {
    label: "Ambassador",
    bg: "bg-amber-500/10 dark:bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-300/40 dark:border-amber-700/50",
    icon: Award,
  },
};

export function TierBadge({ tier, className, showIcon = true }: TierBadgeProps) {
  const config = tierConfig[tier] ?? tierConfig.STARTER;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors",
        config.bg,
        config.text,
        config.border,
        className,
      )}
    >
      {showIcon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {config.label}
    </span>
  );
}
