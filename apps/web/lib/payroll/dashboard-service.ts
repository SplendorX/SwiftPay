import { payrollDb, payrollTables, readPayrollDbError } from "@/lib/payroll/db";
import type { PayrollDashboardSummary, PayrollRunRecord } from "@/lib/payroll/types";

export async function getPayrollDashboardSummary(accountId: string): Promise<PayrollDashboardSummary> {
  const supabase = payrollDb();
  const acc = accountId.toLowerCase();

  // 1. Active team members count
  const { count: activeCount, error: countError } = await supabase
    .from(payrollTables.teamMembers)
    .select("id", { count: "exact", head: true })
    .eq("account_id", acc)
    .eq("status", "ACTIVE");

  if (countError) {
    throw new Error(readPayrollDbError(countError, "Could not load payroll team count."));
  }

  // 2. Recent runs (all runs ordered by created_at desc)
  const { data: runs, error: runsError } = await supabase
    .from(payrollTables.runs)
    .select("*")
    .eq("account_id", acc)
    .order("created_at", { ascending: false })
    .limit(10);

  if (runsError) {
    throw new Error(readPayrollDbError(runsError, "Could not load payroll runs."));
  }

  const allRuns = (runs ?? []) as PayrollRunRecord[];

  // Find upcoming run (DRAFT, READY, APPROVED, or PROCESSING)
  const upcomingRun =
    allRuns.find((r) => ["READY", "APPROVED", "PROCESSING", "DRAFT"].includes(r.status)) ?? null;

  // Find last finished run
  const lastCompletedRun =
    allRuns.find((r) => ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(r.status)) ?? null;

  // 3. Active schedules to project next scheduled date if no explicit upcoming run
  const { data: schedules } = await supabase
    .from(payrollTables.schedules)
    .select("next_run_at")
    .eq("account_id", acc)
    .eq("is_active", true)
    .order("next_run_at", { ascending: true })
    .limit(1);

  let nextPayrollDate: string | null = null;
  let nextPayrollAmount: string | null = null;

  if (upcomingRun) {
    nextPayrollDate = upcomingRun.created_at;
    nextPayrollAmount = upcomingRun.total_amount;
  } else if (schedules && schedules.length > 0 && schedules[0].next_run_at) {
    nextPayrollDate = schedules[0].next_run_at;
  }

  return {
    activeTeamMembersCount: activeCount ?? 0,
    nextPayrollDate,
    nextPayrollAmount,
    lastPayrollDate: lastCompletedRun?.completed_at ?? lastCompletedRun?.created_at ?? null,
    lastPayrollAmount: lastCompletedRun?.total_amount ?? null,
    lastPayrollStatus: lastCompletedRun?.status ?? null,
    upcomingRun,
    recentRuns: allRuns,
  };
}
