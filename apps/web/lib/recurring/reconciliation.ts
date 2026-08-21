import { confirmSubmittedPayment } from "@/lib/recurring/execution-service";
import { logRecurringEvent } from "@/lib/recurring/logging";
import { notifyRecurringCompleted, notifyRecurringFailure } from "@/lib/recurring/notifications";
import {
  listConfirmingOccurrences,
  loadScheduleById,
  markOccurrenceCompleted,
  markOccurrenceFailed,
  updateExecutionRow,
} from "@/lib/recurring-service";

export async function reconcileSubmittedOccurrences(limit = 25) {
  const rows = await listConfirmingOccurrences(limit);
  let confirmedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  for (const occurrence of rows) {
    try {
      const confirmation = await confirmSubmittedPayment({
        occurrenceId: occurrence.id,
        txHash: occurrence.tx_hash,
      });

      if (confirmation.confirmed) {
        const schedule = await loadScheduleById(occurrence.schedule_id);
        await markOccurrenceCompleted({
          amountUnits:
            occurrence.amount_units ?? schedule?.amount_units ?? "0",
          dueAt: occurrence.due_at,
          executionId: occurrence.id,
          providerTransactionId:
            occurrence.provider_transaction_id ?? occurrence.tx_hash,
          scheduleId: occurrence.schedule_id,
          txHash: occurrence.tx_hash,
        });
        confirmedCount += 1;
        if (schedule) {
          await notifyRecurringCompleted({
            amount: occurrence.amount ?? schedule.amount,
            ownerWallet: occurrence.owner_wallet,
            scheduleId: schedule.id,
            tokenSymbol: schedule.token_symbol,
            txHash: occurrence.tx_hash,
          });
        }
        logRecurringEvent("recurring.reconcile", {
          finalStatus: "COMPLETED",
          occurrenceId: occurrence.id,
          providerTransactionId: occurrence.tx_hash,
          recurringPaymentId: occurrence.schedule_id,
        });
        continue;
      }

      if (confirmation.failed) {
        await markOccurrenceFailed({
          executionId: occurrence.id,
          message: "On-chain confirmation failed.",
          permanent: true,
          scheduleId: occurrence.schedule_id,
        });
        failedCount += 1;
        await notifyRecurringFailure({
          amount: occurrence.amount ?? "0",
          ownerWallet: occurrence.owner_wallet,
          reason: "On-chain confirmation failed.",
          relatedTxHash: occurrence.tx_hash,
          scheduleId: occurrence.schedule_id,
          tokenSymbol: "USDC",
        });
        continue;
      }

      if (occurrence.status === "PROCESSING" && occurrence.tx_hash) {
        await updateExecutionRow(occurrence.id, { status: "CONFIRMING" }, [
          "PROCESSING",
          "SUBMITTED",
        ]);
      }
      pendingCount += 1;
    } catch (error) {
      pendingCount += 1;
      logRecurringEvent("recurring.reconcile", {
        failureReason:
          error instanceof Error ? error.message : "Reconcile failed.",
        occurrenceId: occurrence.id,
        recurringPaymentId: occurrence.schedule_id,
      });
    }
  }

  return {
    confirmedCount,
    failedCount,
    pendingCount,
    scannedCount: rows.length,
  };
}

export async function applyProviderConfirmation(input: {
  occurrenceId?: string;
  providerTransactionId?: string | null;
  success: boolean;
  txHash?: string | null;
}) {
  const { loadExecutionById } = await import("@/lib/recurring-service");
  const { createSupabaseAdminClient } = await import("@/lib/supabase-server");
  const executionsTable =
    process.env.SUPABASE_RECURRING_EXECUTIONS_TABLE ?? "recurring_executions";

  let occurrence = input.occurrenceId
    ? await loadExecutionById(input.occurrenceId)
    : null;

  if (!occurrence && (input.txHash || input.providerTransactionId)) {
    const supabase = createSupabaseAdminClient();
    const query = supabase.from(executionsTable).select("*");
    const found = input.txHash
      ? await query.eq("tx_hash", input.txHash).maybeSingle()
      : await query
          .eq("provider_transaction_id", input.providerTransactionId)
          .maybeSingle();
    if (found.data) {
      occurrence = found.data;
    }
  }

  if (!occurrence) {
    return { applied: false, reason: "occurrence_not_found" };
  }

  if (
    occurrence.status === "COMPLETED" ||
    occurrence.status === "confirmed" ||
    occurrence.status === "FAILED_PERMANENTLY"
  ) {
    return { applied: false, reason: "already_terminal", occurrence };
  }

  if (input.success) {
    const completed = await markOccurrenceCompleted({
      amountUnits: occurrence.amount_units ?? "0",
      dueAt: occurrence.due_at,
      executionId: occurrence.id,
      providerTransactionId:
        input.providerTransactionId ?? occurrence.provider_transaction_id,
      scheduleId: occurrence.schedule_id,
      txHash: input.txHash ?? occurrence.tx_hash,
    });
    logRecurringEvent("recurring.webhook", {
      finalStatus: "COMPLETED",
      occurrenceId: occurrence.id,
      providerTransactionId: input.providerTransactionId ?? input.txHash,
      recurringPaymentId: occurrence.schedule_id,
    });
    return { applied: true, occurrence: completed };
  }

  await markOccurrenceFailed({
    executionId: occurrence.id,
    message: "Provider reported payment failure.",
    permanent: true,
    scheduleId: occurrence.schedule_id,
  });
  logRecurringEvent("recurring.webhook", {
    finalStatus: "FAILED_PERMANENTLY",
    occurrenceId: occurrence.id,
    providerTransactionId: input.providerTransactionId ?? input.txHash,
    recurringPaymentId: occurrence.schedule_id,
  });
  return { applied: true, occurrence };
}
