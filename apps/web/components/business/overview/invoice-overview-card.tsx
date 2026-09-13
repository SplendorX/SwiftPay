"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { InvoiceAttentionRow } from "./invoice-attention-row";
import type { InvoiceOverviewData } from "./types";

type InvoiceOverviewCardProps = {
  data: InvoiceOverviewData;
};

export function InvoiceOverviewCard({ data }: InvoiceOverviewCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/70">
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground">
              Invoices
            </h2>
            <p className="text-xs text-muted-foreground">
              Receivables and client payment tracking
            </p>
          </div>
          <Link
            href="/business/invoices"
            className="group flex items-center gap-1 text-xs font-semibold text-[#5B21B6] hover:text-[#4C1D95] dark:text-purple-400 dark:hover:text-purple-300 transition-colors shrink-0"
          >
            <span>Manage invoices</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* 2 Top Stat Blocks */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
            <span className="text-xs font-medium text-muted-foreground">
              Outstanding
            </span>
            <div className="mt-1 font-heading text-xl font-bold text-foreground">
              {data.outstandingFormatted}
            </div>
            <span className="text-xs text-muted-foreground">
              {data.outstandingCount} {data.outstandingCount === 1 ? "invoice" : "invoices"}
            </span>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
            <span className="text-xs font-medium text-muted-foreground">
              Paid this month
            </span>
            <div className="mt-1 font-heading text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {data.paidThisMonthFormatted}
            </div>
            <span className="text-xs text-muted-foreground">
              {data.paidThisMonthCount} {data.paidThisMonthCount === 1 ? "invoice" : "invoices"}
            </span>
          </div>
        </div>

        {/* Needs Attention Section */}
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Needs Attention
          </div>

          {data.attentionItems.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>All invoices are current and accounted for.</span>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {data.attentionItems.map((item) => (
                <InvoiceAttentionRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
