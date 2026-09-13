"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
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
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge";
import { PayrollSubnav } from "@/components/payroll/payroll-subnav";
import { fetchPayrollDashboard } from "@/lib/payroll/client";
import type { PayrollDashboardSummary } from "@/lib/payroll/types";

export default function PayrollDashboardPage() {
  const { account, ownerWallet, circleSocialUuid } = useAccountContext();
  const [summary, setSummary] = useState<PayrollDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  async function loadData() {
    if (!ownerWallet) return;
    setLoading(true);
    try {
      const data = await fetchPayrollDashboard(ownerWallet, circleSocialUuid ?? undefined);
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
  }, [ownerWallet, circleSocialUuid]);

  if (account && account.account_type !== "BUSINESS") {
    return (
      <PlatformAccessGate>
        <PlatformChrome
          actions={<PlatformProfileControls />}
          subtitle="Exclusive to SwiftPay Business accounts"
          title="Payroll"
        >
          <div className="section-panel p-8 text-center max-w-xl mx-auto my-12">
            <Banknote className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-heading text-2xl">Business Account Required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Payroll is exclusive to SwiftPay Business accounts. Upgrade your account to manage your team and run batch settlements.
            </p>
            <Button asChild className="mt-6">
              <Link href="/settings#account-type">Upgrade to Business</Link>
            </Button>
          </div>
        </PlatformChrome>
      </PlatformAccessGate>
    );
  }

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Team Member
            </Button>
            <Button size="sm" asChild>
              <Link href="/business/payroll/runs/new">
                <Send className="h-4 w-4 mr-1.5" />
                Run Payroll
              </Link>
            </Button>
            <PlatformProfileControls />
          </div>
        }
        subtitle="Manage your team and run payments from one place."
        title="Payroll"
      >
        <PayrollSubnav />

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Section 7: Payroll Summary Metrics */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="section-panel p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Active Team Members</p>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-heading text-2xl font-bold">
              {loading ? "…" : summary?.activeTeamMembersCount ?? 0}
            </p>
            <Link
              href="/business/payroll/team"
              className="mt-2 inline-flex items-center text-xs font-semibold text-primary hover:underline"
            >
              Manage team <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </div>

          <div className="section-panel p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Next Payroll</p>
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-heading text-2xl font-bold">
              {loading
                ? "…"
                : summary?.nextPayrollDate
                ? new Date(summary.nextPayrollDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "Not set"}
            </p>
            <Link
              href="/business/payroll/schedules"
              className="mt-2 inline-flex items-center text-xs font-semibold text-primary hover:underline"
            >
              View schedules <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </div>

          <div className="section-panel p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Estimated Payroll</p>
              <Banknote className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-heading text-2xl font-bold">
              {loading
                ? "…"
                : summary?.nextPayrollAmount
                ? `${summary.nextPayrollAmount} USDC`
                : "0.00 USDC"}
            </p>
            <span className="mt-2 block text-xs text-muted-foreground">Based on active members</span>
          </div>

          <div className="section-panel p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Last Payroll</p>
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-heading text-2xl font-bold">
              {loading
                ? "…"
                : summary?.lastPayrollAmount
                ? `${summary.lastPayrollAmount} USDC`
                : "None"}
            </p>
            <span className="mt-2 block text-xs text-muted-foreground capitalize">
              {summary?.lastPayrollStatus ? summary.lastPayrollStatus.toLowerCase().replace(/_/g, " ") : "No prior runs"}
            </span>
          </div>
        </div>

        {/* Section 8: Upcoming Payroll */}
        <div className="section-panel p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Upcoming Payroll
              </p>
              {summary?.upcomingRun ? (
                <>
                  <h3 className="mt-1 font-heading text-xl">
                    {summary.upcomingRun.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {summary.upcomingRun.recipient_count} recipients · Estimated total:{" "}
                    <span className="font-semibold text-foreground">
                      {summary.upcomingRun.total_amount} {summary.upcomingRun.asset}
                    </span>
                    {" "}(Fee: {summary.upcomingRun.total_fees})
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No upcoming payroll — Create a payroll schedule or run manual payroll to start paying your team.
                </p>
              )}
            </div>

            {summary?.upcomingRun ? (
              <div className="flex items-center gap-3">
                <PayrollStatusBadge status={summary.upcomingRun.status} />
                <Button asChild>
                  <Link href={`/business/payroll/runs/${summary.upcomingRun.id}`}>
                    Review Payroll
                  </Link>
                </Button>
              </div>
            ) : (
              <Button asChild>
                <Link href="/business/payroll/runs/new">Create Payroll</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Section 9: Recent Payroll Runs */}
        <section className="section-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-lg">Recent Payroll Runs</h3>
            <span className="text-xs text-muted-foreground">
              {summary?.recentRuns.length ?? 0} total
            </span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading payroll records…
            </div>
          ) : !summary?.recentRuns || summary.recentRuns.length === 0 ? (
            <div className="py-12 text-center">
              <Banknote className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-sm font-semibold">No payroll has been run yet</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Create your first payroll run to pay your employees and contractors.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/business/payroll/runs/new">Run Payroll</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {summary.recentRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/business/payroll/runs/${run.id}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {run.name}
                      </Link>
                      <PayrollStatusBadge status={run.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {run.recipient_count} recipients ·{" "}
                      {new Date(run.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-heading font-semibold text-foreground">
                        {run.total_amount} {run.asset}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Req: {run.total_required} {run.asset}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/business/payroll/runs/${run.id}`}>
                        Details <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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
