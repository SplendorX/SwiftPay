"use client";

import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";

import { formatMoney } from "@/lib/account/money";
import type { ChargeSummary } from "@/lib/checkout/types";

/** Today's in-person takings from Checkout, with a way into the till. */
export function CheckoutOverviewCard({ summary }: { summary: ChargeSummary }) {
  const stats = [
    { label: "Paid today", value: String(summary.todayCount) },
    { label: "Taken today", value: formatMoney(summary.todayVolume) },
    { label: "Tips today", value: formatMoney(summary.todayTips) },
    { label: "Open charges", value: String(summary.openCount) },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Store className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Checkout
            </h2>
            <p className="text-xs text-muted-foreground">In-person payments by QR code</p>
          </div>
        </div>
        <Link
          className="group flex shrink-0 items-center gap-1 text-xs font-semibold text-[#5B21B6] transition-colors hover:text-[#4C1D95] dark:text-purple-400 dark:hover:text-purple-300"
          href="/business/checkout"
        >
          <span>Charge a customer</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-4" key={stat.label}>
            <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
            <p className="mt-1 font-heading text-xl font-bold tabular-nums text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
