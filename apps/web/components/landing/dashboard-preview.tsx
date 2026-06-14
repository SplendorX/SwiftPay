"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Send, TrendingUp } from "lucide-react";

import { AnimatedCounter } from "@/components/design/motion";
import { Badge } from "@/components/ui/badge";

const chartHeights = [42, 58, 38, 72, 55, 88, 64, 78, 52, 95, 70, 82];

const recentActivity = [
  { amount: "$1,240.00", label: "Batch settlement", status: "Settled" },
  { amount: "$320.50", label: "Payment request", status: "Paid" },
  { amount: "$89.00", label: "Direct send", status: "Confirmed" },
];

export function DashboardPreview() {
  return (
    <div className="preview-panel">
      <div className="preview-toolbar">
        <span className="preview-dot preview-dot-red" />
        <span className="preview-dot preview-dot-amber" />
        <span className="preview-dot preview-dot-green" />
        <span className="ml-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          SwiftPay · Dashboard
        </span>
        <Badge className="ml-auto text-[10px]" variant="secondary">
          Live preview
        </Badge>
      </div>

      <div className="preview-body">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              Available balance
            </p>
            <p className="font-heading text-xl font-semibold tracking-tight">
              <AnimatedCounter value="$24,580.42" />
            </p>
          </div>
          <div className="feature-icon">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>

        <div className="preview-kpi-grid">
          <div className="preview-metric">
            <p className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
              Monthly volume
            </p>
            <p className="mt-0.5 font-heading text-sm font-semibold">$128.4k</p>
          </div>
          <div className="preview-metric">
            <p className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
              Success rate
            </p>
            <p className="mt-0.5 font-heading text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              99.2%
            </p>
          </div>
        </div>

        <div className="preview-chart">
          <div className="preview-chart-bar">
            {chartHeights.map((height, index) => (
              <motion.span
                animate={{ scaleY: 1 }}
                initial={{ scaleY: 0 }}
                key={height}
                style={{ height: `${height}%`, transformOrigin: "bottom" }}
                transition={{ delay: 0.3 + index * 0.04, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {recentActivity.map((item, index) => (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="activity-item"
              initial={{ opacity: 0, x: 8 }}
              key={item.label}
              transition={{ delay: 0.6 + index * 0.1, duration: 0.35 }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Send className="h-3 w-3 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.amount}</p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                {item.status}
              </span>
            </motion.div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="route-node">You</span>
            <span className="route-line max-w-8" />
            <span className="route-node">Arc</span>
            <span className="route-line max-w-8" />
            <span className="route-node">Recipient</span>
          </div>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}