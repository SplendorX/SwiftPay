import { confirmSubmittedPayment, submitAuthorizedPayment } from "@/lib/recurring/execution-service";
import {
  acquireRecurringLock,
  recurringOccurrenceLockKey,
  recurringPaymentLockKey,
  releaseRecurringLock,
} from "@/lib/recurring/lock";
import { logRecurringEvent } from "@/lib/recurring/logging";
import { notifyRecurringCompleted, notifyRecurringFailure } from "@/lib/recurring/notifications";
import {
  claimExecutionForProcessing,
  listWorkerOccurrences,
  loadExecutionById,
  loadExecutionsForSchedule,
  loadScheduleById,
  markOccurrenceCompleted,
  markOccurrenceFailed,
  updateExecutionRow,
} from "@/lib/recurring-service";
import { isPermanentFailureCode } from "@/lib/recurring/state";

function isShadowMode() {
  return process.env.RECURRING_AUTOPAY_SHADOW === "true";
}

export async function executeAutopayOccurrence(occurrenceId: string) {
  const loaded = await loadExecutionById(occurrenceId);
  if (!loaded) {
    return { error: "Occurrence not found.", skipped: true };
  }

  const scheduleLock = await acquireRecurringLock(
    recurringPaymentLockKey(loaded.schedule_id),
  );
  const occurrenceLock = await acquireRecurringLock(
    recurringOccurrenceLockKey(occurrenceId),
  );

  if (!scheduleLock || !occurrenceLock) {
    await releaseRecurringLock(scheduleLock);
    await releaseRecurringLock(occurrenceLock);
    logRecurringEvent("recurring.execution.lock", {
      occurrenceId,
      recurringPaymentId: loaded.schedule_id,
      result: "busy",
    });
    return { skipped: true };
  }

  try {
    const claimed = await claimExecutionForProcessing(occurrenceId);
    if (!claimed) {
      return { skipped: true };
    }

    const schedule = await loadScheduleById(claimed.schedule_id);
    if (!schedule) {
      await markOccurrenceFailed({
        executionId: claimed.id,
        message: "Schedule not found.",
        permanent: true,
        scheduleId: claimed.schedule_id,
      });
      return { error: "Schedule not found.", skipped: false };
    }

    logRecurringEvent("recurring.execution.start", {
      amount: claimed.amount ?? schedule.amount,
      attemptNumber: claimed.attempt_count,
      occurrenceId: claimed.id,
      recipient: schedule.beneficiary_wallet,
      recurringPaymentId: schedule.id,
      userId: schedule.owner_wallet,
    });

    if (isShadowMode()) {
      logRecurringEvent("recurring.execution.submitted", {
        occurrenceId: claimed.id,
        recurringPaymentId: schedule.id,
        shadow: true,
      });
      await updateExecutionRow(claimed.id, {
        error_message: "Shadow mode: occurrence recorded, payment not submitted.",
        status: "DUE",
      });
      return { shadow: true };
    }

    const existing = await loadExecutionsForSchedule(schedule.id);
    const submitted = await submitAuthorizedPayment({
      existingOccurrences: existing,
      occurrence: claimed,
      schedule,
    });

    if (submitted.status === "rejected") {
      const permanent =
        submitted.permanent || isPermanentFailureCode(submitted.code);
      const failed = await markOccurrenceFailed({
        executionId: claimed.id,
        message: submitted.reason,
        permanent,
        scheduleId: schedule.id,
      });
      logRecurringEvent("recurring.execution.failed", {
        attemptNumber: claimed.attempt_count,
        code: submitted.code,
        failureReason: submitted.reason,
        finalStatus: failed?.nextStatus,
        occurrenceId: claimed.id,
        recurringPaymentId: schedule.id,
        userId: schedule.owner_wallet,
      });
      if (failed?.nextStatus === "RETRYING") {
        logRecurringEvent("recurring.execution.retry", {
          attemptNumber: claimed.attempt_count,
          nextRetryAt: failed.nextRetryAt,
          occurrenceId: claimed.id,
          recurringPaymentId: schedule.id,
        });
      }
      await notifyRecurringFailure({
        amount: schedule.amount,
        ownerWallet: schedule.owner_wallet,
        reason: submitted.reason,
        scheduleId: schedule.id,
        tokenSymbol: schedule.token_symbol,
      });
      return { error: submitted.reason, permanent };
    }

    const submittedAt = new Date().toISOString();
    await updateExecutionRow(
      claimed.id,
      {
        error_message: null,
        provider_transaction_id: submitted.txHash ?? null,
        status: submitted.txHash ? "SUBMITTED" : "CONFIRMING",
        submitted_at: submittedAt,
        tx_hash: submitted.txHash ?? null,
      },
      ["PROCESSING"],
    );

    logRecurringEvent("recurring.execution.submitted", {
      alreadyConsumed: submitted.alreadyConsumed,
      occurrenceId: claimed.id,
      providerTransactionId: submitted.txHash ?? null,
      recurringPaymentId: schedule.id,
      userId: schedule.owner_wallet,
    });

    const confirmation = await confirmSubmittedPayment({
      occurrenceId: claimed.id,
      txHash: submitted.txHash,
    });

    if (confirmation.confirmed || submitted.alreadyConsumed) {
      const completed = await markOccurrenceCompleted({
        amountUnits: claimed.amount_units ?? schedule.amount_units,
        dueAt: claimed.due_at,
        executionId: claimed.id,
        providerTransactionId: submitted.txHash,
        scheduleId: schedule.id,
        txHash: submitted.txHash,
      });
      logRecurringEvent("recurring.execution.completed", {
        finalStatus: "COMPLETED",
        occurrenceId: claimed.id,
        providerTransactionId: submitted.txHash ?? null,
        recurringPaymentId: schedule.id,
        userId: schedule.owner_wallet,
      });
      await notifyRecurringCompleted({
        amount: schedule.amount,
        ownerWallet: schedule.owner_wallet,
        scheduleId: schedule.id,
        tokenSymbol: schedule.token_symbol,
        txHash: submitted.txHash,
      });
      return { completed: true, execution: completed, txHash: submitted.txHash };
    }

    if (confirmation.failed) {
      await markOccurrenceFailed({
        executionId: claimed.id,
        message: "On-chain transaction reverted.",
        permanent: true,
        scheduleId: schedule.id,
      });
      return { error: "On-chain transaction reverted.", permanent: true };
    }

    await updateExecutionRow(claimed.id, { status: "CONFIRMING" }, [
      "SUBMITTED",
      "PROCESSING",
    ]);
    return { confirming: true, txHash: submitted.txHash };
  } finally {
    await releaseRecurringLock(occurrenceLock);
    await releaseRecurringLock(scheduleLock);
  }
}

export async function processAutopayWorkerBatch(limit = 15) {
  const occurrences = await listWorkerOccurrences(limit);
  const results = [];

  for (const occurrence of occurrences) {
    try {
      const result = await executeAutopayOccurrence(occurrence.id);
      results.push({ occurrenceId: occurrence.id, ...result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Worker failed.";
      results.push({ error: message, occurrenceId: occurrence.id });
      logRecurringEvent("recurring.execution.failed", {
        failureReason: message,
        occurrenceId: occurrence.id,
        recurringPaymentId: occurrence.schedule_id,
      });
    }
  }

  return {
    processedCount: results.length,
    results,
    scannedCount: occurrences.length,
  };
}
