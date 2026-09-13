"use client";

import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import type { InvoiceAttentionItem } from "./types";

type InvoiceAttentionRowProps = {
  item: InvoiceAttentionItem;
};

export function InvoiceAttentionRow({ item }: InvoiceAttentionRowProps) {
  const content = (
    <div className="flex items-center justify-between gap-3 py-3 px-2 rounded-lg -mx-2 transition-colors hover:bg-muted/40 group">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground group-hover:text-foreground">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {item.clientName}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{item.invoiceNumber}</span>
            <span>·</span>
            <span
              className={
                item.isUrgent
                  ? "font-medium text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground"
              }
            >
              {item.dueLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold text-foreground">
          {item.amountFormatted}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
    </div>
  );

  return (
    <Link href={item.href || "/business/invoices"} className="block">
      {content}
    </Link>
  );
}
