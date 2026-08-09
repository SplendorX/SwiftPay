import {
  advanceNextRunAt,
  buildExecutionIdempotencyKey,
  type RecurringScheduleRecord,
} from "@/lib/recurring-utils";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

const schedulesTable =
  process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";
const executionsTable =
  process.env.SUPABASE_RECURRING_EXECUTIONS_TABLE ?? "recurring_executions";

function readSupabaseError(error: { message?: string } | null) {
  const message = error?.message ?? "";

  if (message.toLowerCase().includes("permission denied")) {
    return "Supabase rejected access to recurring tables. Run packages/database/supabase/recurring-schedules.sql.";
  }

  if (message.toLowerCase().includes("does not exist")) {
    return "Create recurring tables with packages/database/supabase/recurring-schedules.sql.";
  }

  return message || "Supabase could not process this recurring payment.";
}

export async function advanceScheduleAfterConfirmedRun(
  scheduleId: string,
  dueAt: string | Date,
) {
  const supabase = createSupabaseAdminClient();
  const dueDate =
    typeof dueAt === "string" ? new Date(dueAt) : new Date(dueAt.getTime());
  const loaded = await supabase
    .from(schedulesTable)
    .select("*")
    .eq("id", scheduleId)
    .single();

  if (loaded.error || !loaded.data) {
    return;
  }

  const schedule = loaded.data as RecurringScheduleRecord;
  const scheduleNextRun = new Date(schedule.next_run_at).getTime();

  if (Math.abs(scheduleNextRun - dueDate.getTime()) > 1000) {
    return;
  }

  const nextRunAt = advanceNextRunAt(
    dueDate,
    schedule.frequency,
    schedule.interval_days,
  );
  const reachedMaxRuns =
    schedule.max_runs !== null &&
    schedule.max_runs !== undefined &&
    schedule.run_count + 1 >= schedule.max_runs;
  const reachedEndDate =
    schedule.ends_at !== null &&
    schedule.ends_at !== undefined &&
    nextRunAt.getTime() > new Date(schedule.ends_at).getTime();

  await supabase
    .from(schedulesTable)
    .update({
      last_run_at: dueDate.toISOString(),
      next_run_at: nextRunAt.toISOString(),
      run_count: schedule.run_count + 1,
      status: reachedMaxRuns || reachedEndDate ? "completed" : schedule.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);
}

export async function createDueExecutionForSchedule(
  schedule: RecurringScheduleRecord,
  dueAt = new Date(schedule.next_run_at),
) {
  const supabase = createSupabaseAdminClient();
  const idempotencyKey = buildExecutionIdempotencyKey(schedule.id, dueAt);
  const existing = await supabase
    .from(executionsTable)
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.error) {
    throw new Error(readSupabaseError(existing.error));
  }

  if (existing.data) {
    const loaded = await supabase
      .from(executionsTable)
      .select("*")
      .eq("id", existing.data.id)
      .single();

    if (loaded.error || !loaded.data) {
      throw new Error(readSupabaseError(loaded.error));
    }

    return loaded.data;
  }

  const execution = {
    due_at: dueAt.toISOString(),
    idempotency_key: idempotencyKey,
    owner_wallet: schedule.owner_wallet.toLowerCase(),
    schedule_id: schedule.id,
    status: "awaiting_wallet",
  };

  const inserted = await supabase
    .from(executionsTable)
    .insert(execution)
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error(readSupabaseError(inserted.error));
  }

  return inserted.data;
}

export async function createManualExecutionForSchedule(
  schedule: RecurringScheduleRecord,
) {
  const supabase = createSupabaseAdminClient();
  const dueAt = new Date();
  const idempotencyKey = `${buildExecutionIdempotencyKey(schedule.id, dueAt)}:manual:${Date.now()}`;
  const execution = {
    due_at: dueAt.toISOString(),
    idempotency_key: idempotencyKey,
    owner_wallet: schedule.owner_wallet.toLowerCase(),
    schedule_id: schedule.id,
    status: "awaiting_wallet",
  };
  const inserted = await supabase
    .from(executionsTable)
    .insert(execution)
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error(readSupabaseError(inserted.error));
  }

  return inserted.data;
}

/**
 * Queue a due execution only.
 * Settlement is done by the owner's connected wallet in the SwiftRecurepay hub
 * (no server private key required). Optional operator pull remains available via
 * processAutopayExecutions when env operator keys are configured.
 */
async function processScheduleDueRun(schedule: RecurringScheduleRecord) {
  const execution = await createDueExecutionForSchedule(schedule);
  return { autopay: null, execution };
}

export async function processSingleDueSchedule(
  schedule: RecurringScheduleRecord,
) {
  if (schedule.status !== "active") {
    return null;
  }

  const now = Date.now();
  const nextRunAt = new Date(schedule.next_run_at).getTime();

  if (nextRunAt > now) {
    return null;
  }

  return processScheduleDueRun(schedule);
}

async function processDueScheduleRows(schedules: RecurringScheduleRecord[]) {
  const created = [];
  const errors: Array<{ scheduleId: string; message: string }> = [];

  for (const schedule of schedules) {
    try {
      const result = await processScheduleDueRun(schedule);
      created.push(result.execution);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not process recurring schedule.";

      errors.push({
        message,
        scheduleId: schedule.id,
      });
    }
  }

  return {
    createdCount: created.length,
    errors,
    executions: created,
    scannedCount: schedules.length,
  };
}

export async function processDueRecurringSchedules(limit = 50) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const due = await supabase
    .from(schedulesTable)
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (due.error) {
    throw new Error(readSupabaseError(due.error));
  }

  return processDueScheduleRows((due.data ?? []) as RecurringScheduleRecord[]);
}

/** Queue + settle due schedules for one owner (authenticated process API). */
export async function processDueRecurringSchedulesForOwner(
  ownerWallet: string,
  limit = 50,
) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const due = await supabase
    .from(schedulesTable)
    .select("*")
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .eq("status", "active")
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (due.error) {
    throw new Error(readSupabaseError(due.error));
  }

  return processDueScheduleRows((due.data ?? []) as RecurringScheduleRecord[]);
}