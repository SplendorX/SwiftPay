"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  Banknote,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Layers,
  Loader2,
  Plus,
  Send,
  Users,
} from "lucide-react";

import { useAccountContext } from "@/components/account/account-provider";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Button } from "@/components/ui/button";
import { AddTeamMemberModal } from "@/components/payroll/add-team-member-modal";
import { PayrollDashboardSkeleton } from "@/components/payroll/payroll-dashboard-skeleton";
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge";
import { PayrollSubnav } from "@/components/payroll/payroll-subnav";
import { fetchPayrollDashboard } from "@/lib/payroll/client";
import type { PayrollDashboardSummary, PayrollRunStatus } from "@/lib/payroll/types";

function formatAmount(value?: string | null) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string | null, withYear = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff} days`;
}

function prettyStatus(status?: PayrollRunStatus | null) {
  if (!status) return null;
  return status.toLowerCase().replace(/_/g, " ");
}

function runVisual(status: PayrollRunStatus) {
  switch (status) {
    case "COMPLETED":
      return {
        Icon: CheckCircle2,
        tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "APPROVED":
    case "READY":
      return {
        Icon: Send,
        tone: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
      };
    case "PROCESSING":
      return {
        Icon: Clock,
        tone: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
    case "PARTIALLY_COMPLETED":
      return {
        Icon: AlertTriangle,
        tone: "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400",
      };
    case "FAILED":
      return {
        Icon: AlertCircle,
        tone: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
      };
    case "CANCELLED":
      return { Icon: Ban, tone: "border-border bg-muted/60 text-muted-foreground" };
    default:
      return { Icon: FileText, tone: "border-border bg-muted/60 text-muted-foreground" };
  }
}

const shortcuts = [
  {
    href: "/business/payroll/team",
    label: "Team",
    description: "Members, pay rates, and wallets",
    icon: Users,
  },
  {
    href: "/business/payroll/groups",
    label: "Groups",
    description: "Bundle members into pay groups",
    icon: Layers,
  },
  {
    href: "/business/payroll/schedules",
    label: "Schedules",
    description: "Automate recurring payroll runs",
    icon: Calendar,
  },
];

export default function PayrollDashboardPage() {
  const { account, ownerWallet, circleSocialUuid, loading: accountLoading } = useAccountContext();
  const [summary, setSummary] = useState<PayrollDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const isBusiness = account?.account_type === "BUSINESS";

  async function loadData() {
    if (!ownerWallet || !isBusiness) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchPayrollDashboard(
        ownerWallet,
        circleSocialUuid ?? undefined,
      );
      setSummary(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payroll dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [ownerWallet, circleSocialUuid, isBusiness]);

  if (accountLoading || (ownerWallet && loading && !summary)) {
    return (
      <PlatformAccessGate>
        <PlatformChrome
          actions={<PlatformProfileControls />}
          subtitle="Manage your team and run payments from one place."
          title="Payroll"
        >
          <PayrollSubnav />
          <PayrollDashboardSkeleton />
        </PlatformChrome>
      </PlatformAccessGate>
    );
  }

  if (!isBusiness) {
    return (
      <PlatformAccessGate>
        <PlatformChrome
          actions={<PlatformProfileControls />}
          subtitle="Exclusive to SwiftPay Business accounts"
          title="Payroll"
        >
          <div className="mx-auto my-12 max-w-xl overflow-hidden rounded-2xl border border-border bg-card p-8 text-center shadow-xs">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Banknote className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-heading text-2xl font-bold tracking-tight">
              Business Account Required
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Payroll is exclusive to SwiftPay Business accounts. Upgrade your account to manage
              your team and run batch settlements.
            </p>
            <Button asChild className="mt-6" size="lg">
              <Link href="/settings#account-type">Upgrade to Business</Link>
            </Button>
          </div>
        </PlatformChrome>
      </PlatformAccessGate>
    );
  }

  const upcoming = summary?.upcomingRun ?? null;
  const heroAmount = upcoming
    ? formatAmount(upcoming.total_amount)
    : formatAmount(summary?.nextPayrollAmount);
  const heroAsset = upcoming?.asset ?? "USDC";
  const nextDate = formatDate(summary?.nextPayrollDate);
  const nextCountdown = daysUntil(summary?.nextPayrollDate);
  const lastAmount = formatAmount(summary?.lastPayrollAmount);
  const teamCount = summary?.activeTeamMembersCount ?? 0;

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Manage your team and run payments from one place."
        title="Payroll"
      >
        <PayrollSubnav />

        {/* Action bar */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">
              Overview
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Monitor team compensation, upcoming payroll, and automated runs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Team Member
            </Button>
            <Button size="sm" asChild>
              <Link href="/business/payroll/runs/new">
                <Send className="mr-1.5 h-4 w-4" />
                Run Payroll
              </Link>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Couldn&apos;t load payroll</p>
              <p className="mt-0.5 break-words text-destructive/90">{error}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-destructive hover:bg-destructive/10"
              onClick={() => void loadData()}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {/* Hero: upcoming payroll */}
        <section className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-8">
          <div className="relative grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  {upcoming ? "Upcoming Payroll" : "Next Payroll"}
                </span>
                {upcoming ? <PayrollStatusBadge status={upcoming.status} /> : null}
                {nextCountdown ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    {nextCountdown}
                  </span>
                ) : null}
              </div>

              {upcoming ? (
                <>
                  <h3 className="mt-3 truncate font-heading text-lg font-semibold text-foreground">
                    {upcoming.name}
                  </h3>
                  <p className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                    {heroAmount ?? "0.00"}{" "}
                    <span className="text-xl font-bold text-muted-foreground sm:text-2xl">
                      {heroAsset}
                    </span>
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {upcoming.recipient_count} recipients
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground">
                      Fees {formatAmount(upcoming.total_fees) ?? upcoming.total_fees}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground">
                      Total required{" "}
                      <span className="font-semibold">
                        {formatAmount(upcoming.total_required) ?? upcoming.total_required}{" "}
                        {upcoming.asset}
                      </span>
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button asChild size="lg">
                      <Link href={`/business/payroll/runs/${upcoming.id}`}>
                        Review Payroll
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link href="/business/payroll/schedules">View schedules</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                    {heroAmount ? (
                      <>
                        {heroAmount}{" "}
                        <span className="text-xl font-bold text-muted-foreground sm:text-2xl">
                          {heroAsset}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not scheduled</span>
                    )}
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {nextDate
                      ? `Your next run is set for ${nextDate}. Review it or start a manual payroll at any time.`
                      : "No upcoming payroll yet — create a schedule to automate runs, or pay your team manually now."}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button asChild size="lg">
                      <Link href="/business/payroll/runs/new">
                        <Send className="mr-1.5 h-4 w-4" />
                        Create Payroll
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link href="/business/payroll/schedules">
                        <Calendar className="mr-1.5 h-4 w-4" />
                        Set up a schedule
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Readiness summary */}
            <div className="lg:col-span-5">
              <div className="rounded-xl border border-border bg-background/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  At a glance
                </p>
                <dl className="mt-3 divide-y divide-border/60">
                  <div className="flex items-center justify-between py-2.5 first:pt-0">
                    <dt className="text-sm text-muted-foreground">Active members</dt>
                    <dd className="text-sm font-semibold text-foreground">{teamCount}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-sm text-muted-foreground">Next run date</dt>
                    <dd className="text-sm font-semibold text-foreground">
                      {nextDate ?? "Not set"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5 last:pb-0">
                    <dt className="text-sm text-muted-foreground">Last run</dt>
                    <dd className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {lastAmount ? `${lastAmount} USDC` : "None"}
                      {summary?.lastPayrollStatus ? (
                        <PayrollStatusBadge status={summary.lastPayrollStatus} />
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            href="/business/payroll/team"
            icon={Users}
            label="Active Team Members"
            value={String(teamCount)}
            footer={teamCount === 1 ? "1 member on payroll" : `${teamCount} members on payroll`}
          />
          <MetricCard
            href="/business/payroll/schedules"
            icon={Calendar}
            label="Next Payroll"
            value={nextDate ?? "Not set"}
            footer={nextCountdown ?? "No schedule configured"}
          />
          <MetricCard
            icon={Banknote}
            label="Estimated Payroll"
            value={
              formatAmount(summary?.nextPayrollAmount)
                ? `${formatAmount(summary?.nextPayrollAmount)} USDC`
                : "0.00 USDC"
            }
            footer="Based on active members"
          />
          <MetricCard
            icon={Clock}
            label="Last Payroll"
            value={lastAmount ? `${lastAmount} USDC` : "None"}
            footer={prettyStatus(summary?.lastPayrollStatus) ?? "No prior runs"}
            footerClassName="capitalize"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Recent runs */}
          <section className="flex flex-col rounded-2xl border border-border bg-card shadow-xs lg:col-span-2">
            <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
              <div>
                <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">
                  Recent Payroll Runs
                </h3>
                <p className="text-xs text-muted-foreground">
                  Every manual and scheduled settlement, newest first
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {summary?.recentRuns.length ?? 0} total
              </span>
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading payroll records…
              </div>
            ) : !summary?.recentRuns || summary.recentRuns.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/60">
                  <Banknote className="h-6 w-6 text-muted-foreground/70" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  No payroll has been run yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Create your first payroll run to pay your employees and contractors.
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/business/payroll/runs/new">Run Payroll</Link>
                </Button>
              </div>
            ) : (
              <div className="max-h-[24rem] divide-y divide-border/60 overflow-y-auto px-2 py-1 sm:px-3">
                {summary.recentRuns.map((run) => {
                  const { Icon, tone } = runVisual(run.status);
                  return (
                    <Link
                      key={run.id}
                      href={`/business/payroll/runs/${run.id}`}
                      className="group flex items-center justify-between gap-3 rounded-lg px-3 py-3.5 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {run.name}
                            </span>
                            <PayrollStatusBadge status={run.status} />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {run.recipient_count} recipients ·{" "}
                            {formatDate(run.created_at, true) ?? "—"} · Req{" "}
                            {formatAmount(run.total_required) ?? run.total_required} {run.asset}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-2">
                        <p className="font-heading text-sm font-bold tracking-tight text-foreground">
                          {formatAmount(run.total_amount) ?? run.total_amount} {run.asset}
                        </p>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Shortcuts */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
            <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">
              Manage payroll
            </h3>
            <p className="text-xs text-muted-foreground">
              Jump straight into the setup that drives each run
            </p>

            <div className="mt-4 space-y-2">
              {shortcuts.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3 transition-all hover:border-primary/30 hover:bg-muted/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border p-4">
              <p className="text-sm font-semibold text-foreground">Add someone new</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                New members are included in the next run once their wallet is set.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Team Member
              </Button>
            </div>
          </section>
        </div>

        {/* Add Team Member Modal */}
        {ownerWallet ? (
          <AddTeamMemberModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            ownerWallet={ownerWallet}
            circleSocialUuid={circleSocialUuid ?? undefined}
            onCreated={() => void loadData()}
          />
        ) : null}
      </PlatformChrome>
    </PlatformAccessGate>
  );
}

function MetricCard({
  footer,
  footerClassName,
  href,
  icon: Icon,
  label,
  value,
}: {
  footer: string;
  footerClassName?: string;
  href?: string;
  icon: typeof Users;
  label: string;
  value: string;
}) {
  const content = (
    <div className="group flex h-full flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/25 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
        {value}
      </p>
      <p
        className={`mt-2 flex items-center gap-1 text-xs text-muted-foreground ${footerClassName ?? ""}`}
      >
        {footer}
        {href ? (
          <ArrowRight className="h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
        ) : null}
      </p>
    </div>
  );

  return href ? (
    <Link href={href} className="h-full">
      {content}
    </Link>
  ) : (
    content
  );
}
