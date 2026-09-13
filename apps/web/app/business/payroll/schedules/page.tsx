"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";

import { useAccountContext } from "@/components/account/account-provider";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Button } from "@/components/ui/button";
import { PayrollSubnav } from "@/components/payroll/payroll-subnav";
import {
  createPayrollScheduleClient,
  fetchPayrollGroups,
  fetchPayrollSchedules,
  pausePayrollScheduleClient,
  resumePayrollScheduleClient,
} from "@/lib/payroll/client";
import type { PaymentFrequency, PayrollGroupRecord, PayrollScheduleRecord } from "@/lib/payroll/types";

export default function PayrollSchedulesPage() {
  const { ownerWallet, circleSocialUuid } = useAccountContext();
  const [schedules, setSchedules] = useState<PayrollScheduleRecord[]>([]);
  const [groups, setGroups] = useState<PayrollGroupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [frequency, setFrequency] = useState<PaymentFrequency>("MONTHLY");
  const [groupId, setGroupId] = useState<string>("");
  const [dayOfMonth, setDayOfMonth] = useState<number>(28);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    if (!ownerWallet) return;
    setLoading(true);
    try {
      const [schedulesData, groupsData] = await Promise.all([
        fetchPayrollSchedules(ownerWallet, circleSocialUuid ?? undefined),
        fetchPayrollGroups(ownerWallet, circleSocialUuid ?? undefined),
      ]);
      setSchedules(schedulesData);
      setGroups(groupsData);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load schedules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [ownerWallet, circleSocialUuid]);

  async function handleToggleSchedule(schedule: PayrollScheduleRecord) {
    if (!ownerWallet) return;
    try {
      if (schedule.is_active) {
        await pausePayrollScheduleClient(ownerWallet, schedule.id, circleSocialUuid ?? undefined);
      } else {
        await resumePayrollScheduleClient(ownerWallet, schedule.id, circleSocialUuid ?? undefined);
      }
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update schedule.");
    }
  }

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerWallet) return;
    setSubmitting(true);
    setError(null);
    try {
      await createPayrollScheduleClient(
        ownerWallet,
        {
          frequency,
          payrollGroupId: groupId || null,
          scheduleConfig: {
            day_of_month: Number(dayOfMonth),
          },
        },
        circleSocialUuid ?? undefined,
      );
      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create schedule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Schedule
            </Button>
            <PlatformProfileControls />
          </div>
        }
        subtitle="Automated recurring payroll cadence."
        title="Payroll Schedules"
      >
        <PayrollSubnav />

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Section 21: Important Version 1 Rule Banner */}
        <div className="section-panel p-5 mb-6 flex items-start gap-3 bg-muted/40 border-l-4 border-l-primary">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-bold text-foreground block mb-0.5">
              Version 1 Safe Payroll Rule
            </span>
            Schedules generate ready payroll runs for your review and approval. Payments are never automatically debited without authorized Business approval.
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            Loading schedules…
          </div>
        ) : schedules.length === 0 ? (
          <div className="section-panel p-12 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
            <h3 className="font-heading text-lg font-semibold">No Schedules Configured</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Set up monthly, biweekly, or weekly schedules to automatically generate draft payroll runs for your team.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Schedule
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {schedules.map((sched) => {
              const group = groups.find((g) => g.id === sched.payroll_group_id);

              return (
                <div key={sched.id} className="section-panel p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {sched.frequency}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          sched.is_active
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {sched.is_active ? "Active" : "Paused"}
                      </span>
                    </div>

                    <h3 className="mt-2 font-heading font-bold text-lg">
                      {group ? group.name : "Entire Team"}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Target: {sched.frequency === "MONTHLY" ? `Day ${sched.schedule_config?.day_of_month ?? 28} of month` : "Every Friday"}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold">Next Run</p>
                      <p className="text-xs font-semibold text-foreground">
                        {sched.next_run_at
                          ? new Date(sched.next_run_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Not scheduled"}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleToggleSchedule(sched)}
                    >
                      {sched.is_active ? (
                        <>
                          <Pause className="h-3.5 w-3.5 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Resume
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Schedule Modal */}
        {isModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="font-heading text-lg font-bold">Create Payroll Schedule</h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSchedule} className="mt-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Frequency *</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as PaymentFrequency)}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="BIWEEKLY">Biweekly</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Apply to Group</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                  >
                    <option value="">Entire Team (All Active Members)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {frequency === "MONTHLY" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Day of Month (1 - 31)</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    />
                  </div>
                )}

                <div className="pt-4 border-t border-border flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : "Create Schedule"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
