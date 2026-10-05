import { payrollDb, payrollTables, readPayrollDbError } from "@/lib/payroll/db";
import { createPayrollRun } from "@/lib/payroll/payroll-service";
import { computeNextRun } from "@/lib/payroll/schedule-service";
import { listTeamMembers } from "@/lib/payroll/team-service";
import type {
  PayrollScheduleRecord,
  TeamMemberRecord,
} from "@/lib/payroll/types";

/**
 * Turns payroll schedules into payroll runs when they come due.
 *
 * Deliberately stops short of paying. A payroll run is settled by the business
 * wallet signing a BulkPay transaction in the browser, so paying unattended
 * would mean handing a server key standing authority over the payroll float.
 * Instead the schedule does the tedious, error-prone part — assembling the
 * right people and amounts on the right day — and leaves a READY run for an
 * approver, which payroll wants a human on regardless.
 */

export type ScheduleRunOutcome = {
  payrollRunId?: string;
  reason?: string;
  scheduleId: string;
  status: "CREATED" | "SKIPPED" | "FAILED";
};

/** Active schedules whose next run has come due. */
export async function listDuePayrollSchedules(
  limit = 25,
): Promise<PayrollScheduleRecord[]> {
  const supabase = payrollDb();
  const { data, error } = await supabase
    .from(payrollTables.schedules)
    .select("*")
    .eq("is_active", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(
      readPayrollDbError(error, "Failed to load due payroll schedules."),
    );
  }

  return (data ?? []) as PayrollScheduleRecord[];
}

/**
 * Whether this schedule already produced a run for the period now due.
 *
 * The clock only advances on success, so a partially-completed tick would
 * otherwise create the same payroll twice on the next pass.
 */
async function alreadyRanForPeriod(schedule: PayrollScheduleRecord) {
  const supabase = payrollDb();
  const { data, error } = await supabase
    .from(payrollTables.runs)
    .select("id")
    .eq("account_id", schedule.account_id)
    .eq("payroll_schedule_id", schedule.id)
    .gte("created_at", schedule.next_run_at ?? new Date(0).toISOString())
    .limit(1);

  if (error) {
    throw new Error(readPayrollDbError(error, "Failed checking prior runs."));
  }

  return (data ?? []).length > 0;
}

function scheduleLabel(schedule: PayrollScheduleRecord) {
  const description = schedule.schedule_config?.description?.trim();
  const when = new Date(schedule.next_run_at ?? Date.now());
  const stamp = Number.isFinite(when.getTime())
    ? when.toISOString().slice(0, 10)
    : "scheduled";
  return description ? `${description} — ${stamp}` : `Scheduled payroll ${stamp}`;
}

function payableMembers(members: TeamMemberRecord[]) {
  return members.filter(
    (member) =>
      member.status === "ACTIVE" &&
      !member.archived_at &&
      Number(member.default_payment_amount) > 0 &&
      Boolean(member.wallet_address),
  );
}

async function runSchedule(
  schedule: PayrollScheduleRecord,
): Promise<ScheduleRunOutcome> {
  if (await alreadyRanForPeriod(schedule)) {
    return {
      reason: "A run already exists for this period.",
      scheduleId: schedule.id,
      status: "SKIPPED",
    };
  }

  const members = payableMembers(
    await listTeamMembers(schedule.account_id, {
      groupId: schedule.payroll_group_id ?? undefined,
      status: "ACTIVE",
    }),
  );

  if (members.length === 0) {
    return {
      reason:
        "No active team members with a payable amount, so no run was created.",
      scheduleId: schedule.id,
      status: "SKIPPED",
    };
  }

  const run = await createPayrollRun(
    {
      accountId: schedule.account_id,
      items: members.map((member) => ({
        baseAmount: member.default_payment_amount,
        recipientDestination: member.wallet_address,
        recipientName: member.full_name,
        recipientUsername: member.swiftpay_username,
        teamMemberId: member.id,
      })),
      name: scheduleLabel(schedule),
      payrollGroupId: schedule.payroll_group_id,
      payrollScheduleId: schedule.id,
      source: "SCHEDULED",
    },
    "system:payroll-scheduler",
  );

  return { payrollRunId: run.id, scheduleId: schedule.id, status: "CREATED" };
}

/** Move a schedule to its next occurrence. Only called after a real outcome. */
async function advanceSchedule(schedule: PayrollScheduleRecord) {
  const supabase = payrollDb();
  await supabase
    .from(payrollTables.schedules)
    .update({
      // payroll_schedules has no last_run_at column; the created run carries
      // payroll_schedule_id, so history lives on the runs themselves.
      next_run_at: computeNextRun(schedule.frequency, schedule.schedule_config),
      updated_at: new Date().toISOString(),
    })
    .eq("id", schedule.id);
}

/**
 * One scheduler tick.
 *
 * A failure leaves `next_run_at` where it is so the next tick retries, rather
 * than silently skipping a pay period. A skip still advances, because its
 * causes — no payable members, or a run already made — will not resolve by
 * retrying the same period.
 */
export async function processDuePayrollSchedules(limit = 25) {
  const due = await listDuePayrollSchedules(limit);
  const results: ScheduleRunOutcome[] = [];

  for (const schedule of due) {
    let outcome: ScheduleRunOutcome;
    try {
      outcome = await runSchedule(schedule);
    } catch (cause) {
      outcome = {
        reason:
          cause instanceof Error ? cause.message.split("\n")[0] : "Run failed.",
        scheduleId: schedule.id,
        status: "FAILED",
      };
    }

    if (outcome.status !== "FAILED") {
      await advanceSchedule(schedule);
    }

    // createPayrollRun writes its own PAYROLL_CREATED audit entry; the
    // audit action list has no value for a skip or a failure, so those are
    // logged and returned on the tick result rather than forced into it.
    if (outcome.status !== "CREATED") {
      console.info("[payroll-scheduler]", schedule.id, outcome.status, outcome.reason);
    }

    results.push(outcome);
  }

  return { processed: results.length, results };
}
