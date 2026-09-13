import { payrollDb, payrollTables, readPayrollDbError } from "@/lib/payroll/db";
import { payrollErrors } from "@/lib/payroll/errors";
import type { PaymentFrequency, PayrollScheduleRecord } from "@/lib/payroll/types";

export function computeNextRun(frequency: PaymentFrequency, config?: { day_of_month?: number; day_of_week?: number }): string {
  const now = new Date();
  const next = new Date(now);

  if (frequency === "WEEKLY") {
    // default Friday (5)
    const targetDay = config?.day_of_week ?? 5;
    const currentDay = now.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7;
    next.setDate(now.getDate() + diff);
    next.setHours(9, 0, 0, 0);
  } else if (frequency === "BIWEEKLY") {
    const targetDay = config?.day_of_week ?? 5;
    const currentDay = now.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 14;
    else diff += 7;
    next.setDate(now.getDate() + diff);
    next.setHours(9, 0, 0, 0);
  } else if (frequency === "MONTHLY") {
    // default 28th or config
    const targetDate = config?.day_of_month ?? 28;
    next.setMonth(now.getMonth() + 1);
    next.setDate(targetDate);
    next.setHours(9, 0, 0, 0);
  } else {
    // MANUAL
    return new Date(Date.now() + 30 * 86400000).toISOString();
  }

  return next.toISOString();
}

export async function listPayrollSchedules(accountId: string): Promise<PayrollScheduleRecord[]> {
  const supabase = payrollDb();
  const { data, error } = await supabase
    .from(payrollTables.schedules)
    .select("*")
    .eq("account_id", accountId.toLowerCase())
    .order("created_at", { ascending: false });

  if (error) throw new Error(readPayrollDbError(error, "Could not list payroll schedules."));
  return (data ?? []) as PayrollScheduleRecord[];
}

export async function createPayrollSchedule(input: {
  accountId: string;
  payrollGroupId?: string | null;
  frequency: PaymentFrequency;
  scheduleConfig?: { day_of_month?: number; day_of_week?: number; description?: string };
}): Promise<PayrollScheduleRecord> {
  const nextRunAt = computeNextRun(input.frequency, input.scheduleConfig);
  const supabase = payrollDb();

  const { data, error } = await supabase
    .from(payrollTables.schedules)
    .insert({
      account_id: input.accountId.toLowerCase(),
      payroll_group_id: input.payrollGroupId ?? null,
      frequency: input.frequency,
      schedule_config: input.scheduleConfig ?? {},
      next_run_at: nextRunAt,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(readPayrollDbError(error, "Could not create payroll schedule."));
  return data as PayrollScheduleRecord;
}

export async function updatePayrollSchedule(
  accountId: string,
  id: string,
  patch: Partial<{
    payrollGroupId: string | null;
    frequency: PaymentFrequency;
    scheduleConfig: Record<string, unknown>;
  }>,
): Promise<PayrollScheduleRecord> {
  const supabase = payrollDb();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.payrollGroupId !== undefined) updates.payroll_group_id = patch.payrollGroupId;
  if (patch.scheduleConfig !== undefined) updates.schedule_config = patch.scheduleConfig;
  if (patch.frequency !== undefined) {
    updates.frequency = patch.frequency;
    updates.next_run_at = computeNextRun(patch.frequency, patch.scheduleConfig as any);
  }

  const { data, error } = await supabase
    .from(payrollTables.schedules)
    .update(updates)
    .eq("account_id", accountId.toLowerCase())
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(readPayrollDbError(error, "Could not update payroll schedule."));
  return data as PayrollScheduleRecord;
}

export async function pausePayrollSchedule(accountId: string, id: string): Promise<PayrollScheduleRecord> {
  const supabase = payrollDb();
  const { data, error } = await supabase
    .from(payrollTables.schedules)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("account_id", accountId.toLowerCase())
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(readPayrollDbError(error, "Could not pause schedule."));
  return data as PayrollScheduleRecord;
}

export async function resumePayrollSchedule(accountId: string, id: string): Promise<PayrollScheduleRecord> {
  const supabase = payrollDb();
  const { data, error } = await supabase
    .from(payrollTables.schedules)
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("account_id", accountId.toLowerCase())
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(readPayrollDbError(error, "Could not resume schedule."));
  return data as PayrollScheduleRecord;
}
