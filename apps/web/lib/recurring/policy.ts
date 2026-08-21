import type {
  RecurringExecutionRecord,
  RecurringScheduleRecord,
} from "@/lib/recurring-utils";
import { isRecurringFrequency } from "@/lib/recurring-utils";
import type { PermanentFailureCode } from "@/lib/recurring/state";

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; code: PermanentFailureCode | "ACCOUNT_INELIGIBLE"; reason: string };

function units(value: string | null | undefined) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

export function evaluateAutopayPolicy(input: {
  now?: Date;
  occurrence: Pick<
    RecurringExecutionRecord,
    "amount_units" | "execution_mode" | "occurrence_number" | "status"
  >;
  schedule: RecurringScheduleRecord;
}): PolicyDecision {
  const now = input.now ?? new Date();
  const { schedule, occurrence } = input;

  if (schedule.status === "cancelled" || schedule.status === "completed") {
    return {
      allowed: false,
      code: "SCHEDULE_CANCELLED",
      reason: "Recurring payment is cancelled or completed.",
    };
  }

  if (schedule.status !== "active") {
    return {
      allowed: false,
      code: "SCHEDULE_PAUSED",
      reason: "Recurring payment is not active.",
    };
  }

  if (!schedule.autopay_enabled) {
    return {
      allowed: false,
      code: "AUTHORIZATION_INVALID",
      reason: "Autopay is not enabled.",
    };
  }

  if (schedule.authorization_status === "REVOKED") {
    return {
      allowed: false,
      code: "AUTHORIZATION_REVOKED",
      reason: "Autopay authorization has been revoked.",
    };
  }

  if (schedule.authorization_status === "EXPIRED") {
    return {
      allowed: false,
      code: "AUTHORIZATION_EXPIRED",
      reason: "Autopay authorization has expired.",
    };
  }

  if (schedule.authorization_status !== "AUTHORIZED") {
    return {
      allowed: false,
      code: "AUTHORIZATION_INVALID",
      reason: "Autopay is not authorized for autonomous execution.",
    };
  }

  if (
    schedule.authorization_expires_at &&
    new Date(schedule.authorization_expires_at).getTime() <= now.getTime()
  ) {
    return {
      allowed: false,
      code: "AUTHORIZATION_EXPIRED",
      reason: "Autopay authorization expiration has passed.",
    };
  }

  const authorizedRecipient = (
    schedule.authorized_recipient ?? schedule.beneficiary_wallet
  ).toLowerCase();
  if (authorizedRecipient !== schedule.beneficiary_wallet.toLowerCase()) {
    return {
      allowed: false,
      code: "INVALID_RECIPIENT",
      reason: "Recipient does not match the authorized recipient.",
    };
  }

  const authorizedToken = (
    schedule.authorized_token ?? schedule.token_symbol
  ).toUpperCase();
  if (authorizedToken !== schedule.token_symbol.toUpperCase()) {
    return {
      allowed: false,
      code: "INVALID_TOKEN",
      reason: "Token does not match the authorized token.",
    };
  }

  const paymentUnits = units(occurrence.amount_units ?? schedule.amount_units);
  if (paymentUnits <= 0n) {
    return {
      allowed: false,
      code: "AMOUNT_EXCEEDS_AUTHORIZATION",
      reason: "Payment amount is invalid.",
    };
  }

  const maxUnits = units(
    schedule.max_payment_amount_units ?? schedule.amount_units,
  );
  if (paymentUnits > maxUnits) {
    return {
      allowed: false,
      code: "AMOUNT_EXCEEDS_AUTHORIZATION",
      reason: "Amount exceeds the authorized maximum payment.",
    };
  }

  const totalLimit = schedule.total_limit_units
    ? units(schedule.total_limit_units)
    : null;
  if (totalLimit !== null) {
    const spent = units(schedule.executed_amount_units);
    if (spent + paymentUnits > totalLimit) {
      return {
        allowed: false,
        code: "TOTAL_LIMIT_EXCEEDED",
        reason: "Total spending limit has been exceeded.",
      };
    }
  }

  const startsAt = new Date(schedule.starts_at).getTime();
  if (Number.isFinite(startsAt) && now.getTime() < startsAt) {
    return {
      allowed: false,
      code: "OUTSIDE_AUTHORIZED_PERIOD",
      reason: "Current date is before the authorized start.",
    };
  }

  if (schedule.ends_at) {
    const endsAt = new Date(schedule.ends_at).getTime();
    if (Number.isFinite(endsAt) && now.getTime() > endsAt) {
      return {
        allowed: false,
        code: "OUTSIDE_AUTHORIZED_PERIOD",
        reason: "Current date is after the authorized end date.",
      };
    }
  }

  if (!isRecurringFrequency(schedule.frequency)) {
    return {
      allowed: false,
      code: "AUTHORIZATION_INVALID",
      reason: "Frequency is not valid.",
    };
  }

  if (
    schedule.max_runs !== null &&
    schedule.max_runs !== undefined &&
    schedule.run_count >= schedule.max_runs
  ) {
    return {
      allowed: false,
      code: "TOTAL_LIMIT_EXCEEDED",
      reason: "Maximum run count has been reached.",
    };
  }

  if (!schedule.owner_wallet || !schedule.beneficiary_wallet) {
    return {
      allowed: false,
      code: "ACCOUNT_INELIGIBLE",
      reason: "Account is not eligible for autonomous payment.",
    };
  }

  return { allowed: true };
}
