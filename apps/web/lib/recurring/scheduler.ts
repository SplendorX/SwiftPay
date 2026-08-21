import {
  acquireRecurringLock,
  recurringPaymentLockKey,
  releaseRecurringLock,
} from "@/lib/recurring/lock";
import { logRecurringEvent } from "@/lib/recurring/logging";
import {
  createDueOccurrenceForSchedule,
  listDueAuthorizedSchedules,
  loadScheduleById,
} from "@/lib/recurring-service";

export async function enqueueDueAuthorizedSchedules(limit = 25) {
  const schedules = await listDueAuthorizedSchedules(limit);
  const created: Array<{ scheduleId: string; occurrenceId: string }> = [];
  const skipped: Array<{ scheduleId: string; reason: string }> = [];
  const errors: Array<{ scheduleId: string; message: string }> = [];

  logRecurringEvent("recurring.scheduler.tick", {
    scannedCount: schedules.length,
  });

  for (const schedule of schedules) {
    const lock = await acquireRecurringLock(
      recurringPaymentLockKey(schedule.id),
    );
    if (!lock) {
      skipped.push({
        reason: "lock_unavailable",
        scheduleId: schedule.id,
      });
      continue;
    }

    try {
      const latest = (await loadScheduleById(schedule.id)) ?? schedule;
      if (
        latest.status !== "active" ||
        !latest.autopay_enabled ||
        latest.authorization_status !== "AUTHORIZED"
      ) {
        skipped.push({
          reason: "not_authorized_or_inactive",
          scheduleId: schedule.id,
        });
        continue;
      }

      const occurrence = await createDueOccurrenceForSchedule(
        latest,
        new Date(latest.next_run_at),
        "autopay",
      );

      logRecurringEvent("recurring.scheduler.enqueued", {
        occurrenceId: occurrence.id,
        occurrenceNumber: occurrence.occurrence_number,
        recurringPaymentId: latest.id,
        scheduledFor: occurrence.due_at,
        userId: latest.owner_wallet,
      });

      created.push({
        occurrenceId: occurrence.id,
        scheduleId: latest.id,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Scheduler failed.";
      errors.push({ message, scheduleId: schedule.id });
      logRecurringEvent("recurring.scheduler.skipped", {
        message,
        recurringPaymentId: schedule.id,
      });
    } finally {
      await releaseRecurringLock(lock);
    }
  }

  return {
    createdCount: created.length,
    created,
    errors,
    scannedCount: schedules.length,
    skipped,
  };
}
