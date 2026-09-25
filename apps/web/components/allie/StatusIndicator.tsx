"use client";

import { cn } from "@/lib/utils";

export type AllieStatus = "active" | "paused" | "revoked" | "not_created";

const statusCopy: Record<AllieStatus, { label: string; dot: string }> = {
  active: { label: "ALLIE Active", dot: "bg-emerald-500" },
  paused: { label: "ALLIE Paused", dot: "bg-amber-500" },
  revoked: { label: "ALLIE Revoked", dot: "bg-destructive" },
  not_created: { label: "Set up ALLIE", dot: "bg-muted-foreground/50" },
};

export function StatusIndicator({
  className,
  compact,
  status,
}: {
  className?: string;
  compact?: boolean;
  status: AllieStatus;
}) {
  const copy = statusCopy[status];

  return (
    <span
      aria-label={copy.label}
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground",
        className,
      )}
      title={copy.label}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          copy.dot,
          status === "active" && "animate-pulse",
        )}
      />
      {compact ? null : <span className="truncate">{copy.label}</span>}
    </span>
  );
}
