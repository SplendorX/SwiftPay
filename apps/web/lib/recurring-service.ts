import {
  canAutopaySchedule,
  settleAutopayExecution,
} from "@/lib/recurring-autopay";
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

  const nextRunAt = advanceNextRunAt(
    dueAt,
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
  const updates = {
    last_run_at: dueAt.toISOString(),
    next_run_at: nextRunAt.toISOString(),
    run_count: schedule.run_count + 1,
    status: reachedMaxRuns || reachedEndDate ? "completed" : schedule.status,
    updated_at: new Date().toISOString(),
  };

  const mutation = await supabase
    .from(schedulesTable)
    .update(updates)
    .eq("id", schedule.id)
    .select("*")
    .single();

  if (mutation.error || !mutation.data) {
    throw new Error(readSupabaseError(mutation.error));
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

  const created = [];

  for (const schedule of due.data ?? []) {
    try {
      const typedSchedule = schedule as RecurringScheduleRecord;
      const execution = await createDueExecutionForSchedule(typedSchedule);
      created.push(execution);

      if (canAutopaySchedule(typedSchedule)) {
        await settleAutopayExecution(
          execution.id,
          execution.owner_wallet,
          typedSchedule,
          execution,
        );
      }
    } catch {
      continue;
    }
  }

  return {
    createdCount: created.length,
    executions: created,
    scannedCount: due.data?.length ?? 0,
  };
}