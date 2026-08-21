import { isRecurringOperatorConfigured } from "@/lib/recurring/circle-adapter";
import { reconcileSubmittedOccurrences } from "@/lib/recurring/reconciliation";
import { enqueueDueAuthorizedSchedules } from "@/lib/recurring/scheduler";
import { processAutopayWorkerBatch } from "@/lib/recurring/worker";

/** One scheduler + worker + reconcile pass. Safe to call from cron, authorize, or local tick. */
export async function runAutopayTick(input?: {
  enqueueLimit?: number;
  workerLimit?: number;
}) {
  const scheduler = await enqueueDueAuthorizedSchedules(input?.enqueueLimit ?? 25);
  const worker = isRecurringOperatorConfigured()
    ? await processAutopayWorkerBatch(input?.workerLimit ?? 15)
    : {
        processedCount: 0,
        results: [],
        scannedCount: 0,
        skipped: "operator_not_configured" as const,
      };
  const reconcile = await reconcileSubmittedOccurrences(25);

  return {
    operatorConfigured: isRecurringOperatorConfigured(),
    reconcile,
    scheduler,
    status: "ok" as const,
    worker,
  };
}
