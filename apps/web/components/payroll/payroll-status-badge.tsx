import { cn } from "@/lib/utils";
import type { PayrollItemStatus, PayrollRunStatus, TeamMemberStatus } from "@/lib/payroll/types";

export function PayrollStatusBadge({
  status,
  className,
}: {
  status: PayrollRunStatus | PayrollItemStatus | TeamMemberStatus;
  className?: string;
}) {
  let color = "bg-muted text-muted-foreground border-border";

  switch (status) {
    case "ACTIVE":
    case "COMPLETED":
      color = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      break;
    case "APPROVED":
    case "READY":
      color = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      break;
    case "PROCESSING":
    case "RETRYING":
      color = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      break;
    case "PARTIALLY_COMPLETED":
      color = "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
      break;
    case "FAILED":
      color = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
      break;
    case "PAUSED":
    case "DRAFT":
      color = "bg-muted text-muted-foreground border-border";
      break;
    case "ARCHIVED":
    case "CANCELLED":
      color = "bg-muted/60 text-muted-foreground/80 border-border line-through";
      break;
  }

  const label = status.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
        color,
        className,
      )}
    >
      {label}
    </span>
  );
}
