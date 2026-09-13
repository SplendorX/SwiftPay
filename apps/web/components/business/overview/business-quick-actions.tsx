"use client";

import Link from "next/link";
import { Send, FileText, ArrowDownLeft, Users, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BusinessQuickActions() {
  return (
    <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
      {/* Primary Action CTA: Send Payment (Imperial Purple #5B21B6, 44px, rounded-full) */}
      <Button
        asChild
        className="h-11 rounded-full bg-[#5B21B6] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#4C1D95] focus-visible:ring-2 focus-visible:ring-[#5B21B6] transition-all"
      >
        <Link href="/dashboard#send" className="flex items-center gap-2">
          <Send className="h-4 w-4 shrink-0" />
          <span>Send Payment</span>
        </Link>
      </Button>

      {/* Secondary Actions with rounded-full edges matching the rest of the platform */}
      <Button
        asChild
        variant="outline"
        className="h-11 rounded-full border-border bg-card px-4.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Link href="/business/invoices" className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>Create Invoice</span>
        </Link>
      </Button>

      <Button
        asChild
        variant="outline"
        className="h-11 rounded-full border-border bg-card px-4.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Link href="/pay" className="flex items-center gap-2">
          <ArrowDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>Request Payment</span>
        </Link>
      </Button>

      <Button
        asChild
        variant="outline"
        className="h-11 rounded-full border-border bg-card px-4.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Link href="/business/payroll" className="flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>Pay Team</span>
        </Link>
      </Button>

      <Button
        asChild
        variant="outline"
        className="h-11 rounded-full border-border bg-card px-4.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Link href="/swiftBatch" className="flex items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>BatchPay</span>
        </Link>
      </Button>
    </div>
  );
}
