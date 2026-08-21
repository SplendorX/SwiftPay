import type {
  RecurringExecutionRecord,
  RecurringScheduleRecord,
} from "@/lib/recurring-utils";
import { isOpenAutopayExecutionStatus } from "@/lib/recurring-utils";
import type {
  PermanentFailureCode,
  TransientFailureCode,
} from "@/lib/recurring/state";

export type RiskDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: PermanentFailureCode | TransientFailureCode;
      reason: string;
    };

function units(value: string | null | undefined) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

/**
 * Recurring-specific risk checks. There is no separate platform risk engine
 * in this repo, so these live next to Autopay rather than as a second system.
 */
export function evaluateAutopayRisk(input: {
  allowance: bigint;
  balance: bigint;
  existingOccurrences: Array<
    Pick<RecurringExecutionRecord, "id" | "occurrence_number" | "status">
  >;
  feeUnits: bigint;
  now?: Date;
  occurrence: Pick<
    RecurringExecutionRecord,
    "amount_units" | "id" | "occurrence_number"
  >;
  requiredUnits: bigint;
  schedule: RecurringScheduleRecord;
}): RiskDecision {
  const { schedule, occurrence } = input;
  const required = input.requiredUnits;

  if (input.balance < required) {
    return {
      allowed: false,
      code: "INSUFFICIENT_BALANCE",
      reason: "Payer does not have enough token balance for payment plus fee.",
    };
  }

  if (input.allowance < required) {
    return {
      allowed: false,
      code: "INSUFFICIENT_ALLOWANCE",
      reason: "Executor allowance is insufficient for this Autopay occurrence.",
    };
  }

  const maxUnits = units(schedule.max_payment_amount_units ?? schedule.amount_units);
  const paymentUnits = units(occurrence.amount_units ?? schedule.amount_units);
  if (paymentUnits > maxUnits) {
    return {
      allowed: false,
      code: "AMOUNT_EXCEEDS_AUTHORIZATION",
      reason: "Amount exceeds authorized maximum.",
    };
  }

  const duplicate = input.existingOccurrences.find(
    (row) =>
      row.id !== occurrence.id &&
      row.occurrence_number === occurrence.occurrence_number &&
      isOpenAutopayExecutionStatus(row.status),
  );
  if (duplicate) {
    return {
      allowed: false,
      code: "DUPLICATE_OCCURRENCE",
      reason: "Another open occurrence already exists for this payment slot.",
    };
  }

  const authorizedRecipient = (
    schedule.authorized_recipient ?? schedule.beneficiary_wallet
  ).toLowerCase();
  if (authorizedRecipient !== schedule.beneficiary_wallet.toLowerCase()) {
    return {
      allowed: false,
      code: "INVALID_RECIPIENT",
      reason: "Recipient changed after Autopay authorization.",
    };
  }

  const maxRetries = schedule.max_retries ?? 4;
  if (schedule.failure_count >= maxRetries + 2) {
    return {
      allowed: false,
      code: "PROVIDER_PERMANENT_REJECTION",
      reason: "Repeated failures have restricted this Autopay schedule.",
    };
  }

  return { allowed: true };
}
