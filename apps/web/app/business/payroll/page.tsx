"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Banknote,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  Loader2,
  Plus,
  Send,
  UserPlus,
  Users,
} from "lucide-react";

import { useAccountContext } from "@/components/account/account-provider";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AddTeamMemberModal } from "@/components/payroll/add-team-member-modal";
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge";
import { fetchPayrollDashboard } from "@/lib/payroll/client";
import type { PayrollDashboardSummary, PayrollRunStatus } from "@/lib/payroll/types";

import "./payroll.css";

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

/** The loading state, shaped like the page so nothing jumps when it arrives. */
function PayrollLoading() {
  return (
    <div aria-busy="true" aria-label="Loading payroll" className="pr-page">
      <header className="pr-bar">
        <Link aria-label="Back to the business overview" className="pr-round" href="/business">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="pr-title">Payroll</h1>
        <Skeleton className="h-11 w-11 rounded-full" />
      </header>
      <Skeleton className="h-[13.5rem] rounded-[1.4rem]" />
      <Skeleton className="h-[6.4rem] rounded-[1.25rem]" />
      <div className="pr-stats">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton className="h-[6rem] rounded-[1.1rem]" key={index} />
        ))}
      </div>
      <Skeleton className="h-64 rounded-[1.25rem]" />
    </div>
  );
}

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
          hideHeader
          subtitle="Manage your team and run payments from one place."
          title="Payroll"
        >
          <PayrollLoading />
        </PlatformChrome>
      </PlatformAccessGate>
    );
  }

  if (!isBusiness) {
    return (
      <PlatformAccessGate>
        <PlatformChrome
          actions={<PlatformProfileControls />}
          subtitle="Exclusive to SaphraONE Business accounts"
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
              Payroll is exclusive to SaphraONE Business accounts. Upgrade your account to manage
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
        // The page draws its own bar with a back button.
        hideHeader
        subtitle="Manage your team and run payments from one place."
        title="Payroll"
      >
        <div className="pr-page">
          <header className="pr-bar">
            <Link aria-label="Back to the business overview" className="pr-round" href="/business">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="pr-title">Payroll</h1>
            <button
              aria-label="Add team member"
              className="pr-round is-primary"
              onClick={() => setIsAddModalOpen(true)}
              title="Add team member"
              type="button"
            >
              <UserPlus className="h-5 w-5" />
            </button>
          </header>


          {error ? (
            <div className="pr-alert" role="alert">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Couldn&apos;t load payroll</p>
                <p className="mt-0.5 break-words opacity-90">{error}</p>
              </div>
              <button onClick={() => void loadData()} type="button">
                Retry
              </button>
            </div>
          ) : null}

          {/* Hero: the next payroll */}
          <section className="pr-hero">
            <span aria-hidden className="pr-hero-glow" />
            <div className="pr-hero-top">
              <span className="pr-hero-eyebrow">
                <Banknote className="h-4 w-4" />
                {upcoming ? "Upcoming payroll" : "Next payroll"}
              </span>
              {nextCountdown ? (
                <span className="pr-hero-pill">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {nextCountdown}
                </span>
              ) : null}
            </div>

            {upcoming ? (
              <>
                <p className="pr-hero-name">
                  {upcoming.name} · {prettyStatus(upcoming.status)}
                </p>
                <p className="pr-hero-amount">
                  {heroAmount ?? "0.00"} <span>{heroAsset}</span>
                </p>
                <div className="pr-hero-chips">
                  <span>
                    <Users className="h-3.5 w-3.5" />
                    {upcoming.recipient_count} recipients
                  </span>
                  <span>Fees {formatAmount(upcoming.total_fees) ?? upcoming.total_fees}</span>
                  <span>
                    Total {formatAmount(upcoming.total_required) ?? upcoming.total_required} {upcoming.asset}
                  </span>
                </div>
                <div className="pr-hero-actions">
                  <Link className="pr-hero-button is-solid" href={`/business/payroll/runs/${upcoming.id}`}>
                    Review payroll
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link className="pr-hero-button" href="/business/payroll/schedules">
                    View schedules
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="pr-hero-amount">
                  {heroAmount ? (
                    <>
                      {heroAmount} <span>{heroAsset}</span>
                    </>
                  ) : (
                    "Not scheduled"
                  )}
                </p>
                <p className="pr-hero-sub">
                  {nextDate
                    ? `Your next run is set for ${nextDate}. Review it or start a manual payroll at any time.`
                    : "No upcoming payroll yet. Create a schedule to automate runs, or pay your team manually now."}
                </p>
                <div className="pr-hero-actions">
                  <Link className="pr-hero-button is-solid" href="/business/payroll/runs/new">
                    <Send className="h-4 w-4" />
                    Create payroll
                  </Link>
                  <Link className="pr-hero-button" href="/business/payroll/schedules">
                    <Calendar className="h-4 w-4" />
                    Set up a schedule
                  </Link>
                </div>
              </>
            )}
          </section>

          {/* Quick actions */}
          <nav aria-label="Payroll actions" className="pr-quick">
            <Link href="/business/payroll/runs/new">
              <span className="pr-quick-icon">
                <Send className="h-5 w-5" />
              </span>
              Run payroll
            </Link>
            <button onClick={() => setIsAddModalOpen(true)} type="button">
              <span className="pr-quick-icon">
                <Plus className="h-5 w-5" />
              </span>
              Add member
            </button>
            {shortcuts.map((item) => (
              <Link href={item.href} key={item.href} title={item.description}>
                <span className="pr-quick-icon">
                  <item.icon className="h-5 w-5" />
                </span>
                {item.label}
              </Link>
            ))}
          </nav>

          {/* At a glance */}
          <div className="pr-stats">
            <StatTile
              footer={teamCount === 1 ? "1 member on payroll" : `${teamCount} members on payroll`}
              href="/business/payroll/team"
              icon={Users}
              label="Active members"
              value={String(teamCount)}
            />
            <StatTile
              footer={nextCountdown ?? "No schedule configured"}
              href="/business/payroll/schedules"
              icon={Calendar}
              label="Next payroll"
              value={nextDate ?? "Not set"}
            />
            <StatTile
              footer="Based on active members"
              icon={Banknote}
              label="Estimated payroll"
              value={
                formatAmount(summary?.nextPayrollAmount)
                  ? `${formatAmount(summary?.nextPayrollAmount)} USDC`
                  : "0.00 USDC"
              }
            />
            <StatTile
              footer={prettyStatus(summary?.lastPayrollStatus) ?? "No prior runs"}
              icon={Clock}
              label="Last payroll"
              value={lastAmount ? `${lastAmount} USDC` : "None"}
            />
          </div>

          {/* Recent runs */}
          <section className="pr-card">
            <div className="pr-card-head">
              <div>
                <h2>Recent payroll runs</h2>
                <p>Every manual and scheduled run, newest first</p>
              </div>
              <span className="pr-count">{summary?.recentRuns.length ?? 0}</span>
            </div>

            {loading ? (
              <p className="pr-empty">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading payroll records…
              </p>
            ) : !summary?.recentRuns || summary.recentRuns.length === 0 ? (
              <div className="pr-empty is-first">
                <span aria-hidden className="pr-empty-icon">
                  <Banknote className="h-7 w-7" />
                </span>
                <p className="pr-empty-title">No payroll has been run yet</p>
                <p>Create your first payroll run to pay your employees and contractors.</p>
                <Button asChild className="mt-2 h-11 rounded-xl">
                  <Link href="/business/payroll/runs/new">Run payroll</Link>
                </Button>
              </div>
            ) : (
              <ul className="pr-runs">
                {summary.recentRuns.map((run) => {
                  const { Icon, tone } = runVisual(run.status);
                  return (
                    <li key={run.id}>
                      <Link className="pr-run" href={`/business/payroll/runs/${run.id}`}>
                        <span className={`pr-run-icon ${tone}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="pr-run-main">
                          <span className="pr-run-title">{run.name}</span>
                          <span className="pr-run-sub">
                            {run.recipient_count} recipients · {formatDate(run.created_at, true) ?? "—"}
                          </span>
                        </span>
                        <span className="pr-run-side">
                          <span className="pr-run-amount">
                            {formatAmount(run.total_amount) ?? run.total_amount} {run.asset}
                          </span>
                          <PayrollStatusBadge className="pr-run-badge" status={run.status} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
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

function StatTile({
  footer,
  href,
  icon: Icon,
  label,
  value,
}: {
  footer: string;
  href?: string;
  icon: typeof Users;
  label: string;
  value: string;
}) {
  const content = (
    <>
      <span className="pr-stat-top">
        <span>{label}</span>
        <span className="pr-stat-icon">
          <Icon className="h-4 w-4" />
        </span>
      </span>
      <span className="pr-stat-value">{value}</span>
      <span className="pr-stat-foot">
        {footer}
        {href ? <ArrowRight className="h-3 w-3 shrink-0" /> : null}
      </span>
    </>
  );

  return href ? (
    <Link className="pr-stat is-link" href={href}>
      {content}
    </Link>
  ) : (
    <div className="pr-stat">{content}</div>
  );
}
