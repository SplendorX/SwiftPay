import { keccak256, parseUnits, stringToBytes } from "viem";

import { arcTestnetTokens, arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";

export const recurringFrequencies = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "custom",
] as const;

export type RecurringFrequency = (typeof recurringFrequencies)[number];

export const recurringScheduleStatuses = [
  "active",
  "paused",
  "cancelled",
  "completed",
] as const;

export type RecurringScheduleStatus =
  (typeof recurringScheduleStatuses)[number];

export const recurringExecutionStatuses = [
  "awaiting_wallet",
  "submitted",
  "confirmed",
  "failed",
  "skipped",
] as const;

export type RecurringExecutionStatus =
  (typeof recurringExecutionStatuses)[number];

export type RecurringWalletMode = "circle" | "external";

export type RecurringScheduleRecord = {
  amount: string;
  amount_units: string;
  autopay_enabled: boolean;
  beneficiary_label: string | null;
  beneficiary_username: string | null;
  beneficiary_wallet: string;
  created_at: string;
  ends_at: string | null;
  frequency: RecurringFrequency;
  id: string;
  interval_days: number | null;
  last_run_at: string | null;
  max_runs: number | null;
  narration: string | null;
  next_run_at: string;
  owner_wallet: string;
  run_count: number;
  starts_at: string;
  status: RecurringScheduleStatus;
  timezone: string;
  token_symbol: ArcTokenSymbol;
  updated_at: string;
  wallet_mode: RecurringWalletMode;
};

export type RecurringExecutionRecord = {
  attempted_at: string | null;
  completed_at: string | null;
  created_at: string;
  due_at: string;
  error_message: string | null;
  id: string;
  idempotency_key: string;
  owner_wallet: string;
  schedule_id: string;
  status: RecurringExecutionStatus;
  tx_hash: string | null;
};

export function isRecurringFrequency(value: string): value is RecurringFrequency {
  return recurringFrequencies.includes(value as RecurringFrequency);
}

export function isRecurringScheduleStatus(
  value: string,
): value is RecurringScheduleStatus {
  return recurringScheduleStatuses.includes(value as RecurringScheduleStatus);
}

export function isRecurringExecutionStatus(
  value: string,
): value is RecurringExecutionStatus {
  return recurringExecutionStatuses.includes(value as RecurringExecutionStatus);
}

export function isArcTokenSymbol(value: string): value is ArcTokenSymbol {
  return arcTokenSymbols.includes(value as ArcTokenSymbol);
}

export function normalizeRecurringAmount(
  amount: string,
  tokenSymbol: ArcTokenSymbol,
) {
  const trimmedAmount = amount.trim();

  if (!trimmedAmount || Number(trimmedAmount) <= 0) {
    return null;
  }

  try {
    const amountUnits = parseUnits(
      trimmedAmount,
      arcTestnetTokens[tokenSymbol].decimals,
    );

    if (amountUnits <= BigInt(0)) {
      return null;
    }

    return {
      amount: trimmedAmount,
      amount_units: amountUnits.toString(),
    };
  } catch {
    return null;
  }
}

export function advanceNextRunAt(
  current: Date,
  frequency: RecurringFrequency,
  intervalDays?: number | null,
) {
  const next = new Date(current);

  switch (frequency) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "biweekly":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "custom": {
      const days = intervalDays && intervalDays > 0 ? intervalDays : 30;
      next.setUTCDate(next.getUTCDate() + days);
      break;
    }
    default:
      next.setUTCDate(next.getUTCDate() + 30);
  }

  return next;
}

export function buildAutopayExecutionId(executionId: string) {
  return keccak256(stringToBytes(executionId));
}

export function buildExecutionIdempotencyKey(
  scheduleId: string,
  dueAt: string | Date,
) {
  const due =
    typeof dueAt === "string" ? new Date(dueAt) : new Date(dueAt.getTime());

  return `${scheduleId}:${due.toISOString()}`;
}

export function formatFrequencyLabel(
  frequency: RecurringFrequency,
  intervalDays?: number | null,
) {
  switch (frequency) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Every 2 weeks";
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "custom":
      return intervalDays ? `Every ${intervalDays} days` : "Custom interval";
    default:
      return frequency;
  }
}

export function formatScheduleRecipient(schedule: RecurringScheduleRecord) {
  if (schedule.beneficiary_username) {
    return `@${schedule.beneficiary_username}`;
  }

  if (schedule.beneficiary_label) {
    return schedule.beneficiary_label;
  }

  return schedule.beneficiary_wallet;
}