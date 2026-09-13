"use client";

import Link from "next/link";
import { ArrowRight, Users, Calendar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeamPaymentsData } from "./types";

type TeamPaymentsCardProps = {
  data: TeamPaymentsData;
};

export function TeamPaymentsCard({ data }: TeamPaymentsCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/70">
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground">
              Team Payments
            </h2>
            <p className="text-xs text-muted-foreground">
              Scheduled contractor and employee disbursements
            </p>
          </div>
          <Link
            href="/business/payroll"
            className="group flex items-center gap-1 text-xs font-semibold text-[#5B21B6] hover:text-[#4C1D95] dark:text-purple-400 dark:hover:text-purple-300 transition-colors shrink-0"
          >
            <span>Manage team payments</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* 3 Stat items */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Next Payroll</span>
            </div>
            <div className="mt-2 font-heading text-base sm:text-lg font-bold text-foreground">
              {data.nextPayrollDateFormatted}
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Team Members</span>
            </div>
            <div className="mt-2 font-heading text-base sm:text-lg font-bold text-foreground">
              {data.teamMembersCount} active
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>Scheduled</span>
            </div>
            <div className="mt-2 font-heading text-base sm:text-lg font-bold text-foreground">
              {data.scheduledAmountFormatted}
            </div>
          </div>
        </div>

        {/* Status notice */}
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5B21B6] text-white">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">
              Scheduled Auto-Disbursement Active
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              Funds are reserved in your vault. Payroll will execute automatically on {data.nextPayrollDateFormatted}.
            </p>
          </div>
        </div>
      </div>

      {/* Action footer */}
      <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          Autonomous multi-currency payroll
        </span>
        <Button asChild size="sm" variant="outline" className="text-xs">
          <Link href="/business/payroll">Review Schedule</Link>
        </Button>
      </div>
    </div>
  );
}
