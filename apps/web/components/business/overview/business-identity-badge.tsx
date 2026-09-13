"use client";

import { CheckCircle2 } from "lucide-react";

type BusinessIdentityBadgeProps = {
  businessName?: string | null;
  isVerified?: boolean;
};

export function BusinessIdentityBadge({
  businessName,
  isVerified = false,
}: BusinessIdentityBadgeProps) {
  return (
    <div className="flex flex-col items-start sm:items-end justify-center gap-1">
      {isVerified ? (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Verified Business</span>
        </div>
      ) : null}
      {businessName ? (
        <span className="text-xs font-medium text-muted-foreground">
          {businessName}
        </span>
      ) : null}
    </div>
  );
}
