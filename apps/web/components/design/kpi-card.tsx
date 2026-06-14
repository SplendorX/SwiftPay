"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type KpiCardProps = {
  change?: string;
  changeTone?: "neutral" | "positive" | "negative";
  className?: string;
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
};

export function KpiCard({
  change,
  changeTone = "neutral",
  className,
  icon: Icon,
  label,
  value,
}: KpiCardProps) {
  return (
    <motion.article
      className={cn("kpi-card group", className)}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kpi-label">{label}</p>
          <div className="kpi-value">{value}</div>
        </div>
        {Icon ? (
          <div className="kpi-icon">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      {change ? (
        <p
          className={cn(
            "mt-3 text-xs font-semibold",
            changeTone === "positive" && "text-emerald-600 dark:text-emerald-400",
            changeTone === "negative" && "text-rose-600 dark:text-rose-400",
            changeTone === "neutral" && "text-muted-foreground",
          )}
        >
          {change}
        </p>
      ) : null}
    </motion.article>
  );
}