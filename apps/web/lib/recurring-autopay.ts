import { isRecurringOperatorConfigured } from "@/lib/recurring/circle-adapter";
import { processAutopayWorkerBatch } from "@/lib/recurring/worker";
import type { RecurringScheduleRecord } from "@/lib/recurring-utils";

export function isAutopayConfigured() {
  return isRecurringOperatorConfigured();
}

/**
 * True when the schedule may execute autonomously (authorized Autopay).
 * autopay_enabled alone is not authorization.
 */
export function canAutopaySchedule(schedule: RecurringScheduleRecord) {
  return (
    schedule.autopay_enabled &&
    schedule.status === "active" &&
    schedule.authorization_status === "AUTHORIZED"
  );
}

export function canOperatorAutopaySchedule(schedule: RecurringScheduleRecord) {
  return canAutopaySchedule(schedule) && isRecurringOperatorConfigured();
}

/** Worker entry used by cron. Does not settle from a user session. */
export async function processAutopayExecutions(limit = 15) {
  if (!isRecurringOperatorConfigured()) {
    return {
      attemptedCount: 0,
      confirmedCount: 0,
      errors: [] as Array<{ executionId: string; message: string }>,
      results: [],
      scannedCount: 0,
    };
  }

  const result = await processAutopayWorkerBatch(limit);
  const errors = result.results
    .filter((row) => "error" in row && row.error)
    .map((row) => ({
      executionId: row.occurrenceId,
      message: String((row as { error?: string }).error),
    }));

  return {
    attemptedCount: result.processedCount,
    confirmedCount: result.results.filter((row) => "completed" in row && row.completed)
      .length,
    errors,
    results: result.results,
    scannedCount: result.scannedCount,
  };
}

export async function processAutopayExecutionsForOwner(
  _ownerWallet: string,
  limit = 15,
) {
  void _ownerWallet;
  return processAutopayExecutions(limit);
}
