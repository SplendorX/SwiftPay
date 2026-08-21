import type { RecurringExecutionStatus } from "@/lib/recurring-utils";

const ALLOWED_TRANSITIONS: Record<
  RecurringExecutionStatus,
  RecurringExecutionStatus[]
> = {
  SCHEDULED: ["DUE", "FAILED_PERMANENTLY"],
  DUE: ["PROCESSING", "FAILED_PERMANENTLY"],
  PROCESSING: [
    "SUBMITTED",
    "CONFIRMING",
    "FAILED",
    "FAILED_PERMANENTLY",
    "COMPLETED",
  ],
  SUBMITTED: ["CONFIRMING", "COMPLETED", "FAILED", "FAILED_PERMANENTLY"],
  CONFIRMING: ["COMPLETED", "FAILED", "FAILED_PERMANENTLY"],
  COMPLETED: [],
  FAILED: ["RETRYING", "FAILED_PERMANENTLY"],
  RETRYING: ["PROCESSING", "FAILED_PERMANENTLY"],
  FAILED_PERMANENTLY: [],
  awaiting_wallet: ["PROCESSING", "submitted", "confirmed", "failed", "DUE"],
  submitted: ["CONFIRMING", "COMPLETED", "confirmed", "failed"],
  confirmed: [],
  failed: ["RETRYING", "FAILED_PERMANENTLY"],
  skipped: [],
};

export function canTransitionExecution(
  from: RecurringExecutionStatus,
  to: RecurringExecutionStatus,
) {
  if (from === to) {
    return true;
  }
  return ALLOWED_TRANSITIONS[from]?.includes(to) === true;
}

export function assertExecutionTransition(
  from: RecurringExecutionStatus,
  to: RecurringExecutionStatus,
) {
  if (!canTransitionExecution(from, to)) {
    throw new Error(`Invalid recurring execution transition: ${from} → ${to}.`);
  }
}

export const PERMANENT_FAILURE_CODES = [
  "AUTHORIZATION_REVOKED",
  "AUTHORIZATION_EXPIRED",
  "AUTHORIZATION_INVALID",
  "SCHEDULE_CANCELLED",
  "SCHEDULE_PAUSED",
  "INVALID_RECIPIENT",
  "INVALID_TOKEN",
  "AMOUNT_EXCEEDS_AUTHORIZATION",
  "TOTAL_LIMIT_EXCEEDED",
  "OUTSIDE_AUTHORIZED_PERIOD",
  "DUPLICATE_OCCURRENCE",
  "PROVIDER_PERMANENT_REJECTION",
] as const;

export type PermanentFailureCode = (typeof PERMANENT_FAILURE_CODES)[number];

export function isPermanentFailureCode(code: string): code is PermanentFailureCode {
  return (PERMANENT_FAILURE_CODES as readonly string[]).includes(code);
}

export const TRANSIENT_FAILURE_CODES = [
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_ALLOWANCE",
  "NETWORK_ERROR",
  "PROVIDER_TIMEOUT",
  "PROVIDER_TEMPORARY",
  "LOCK_UNAVAILABLE",
] as const;

export type TransientFailureCode = (typeof TRANSIENT_FAILURE_CODES)[number];

export function isTransientFailureCode(code: string): code is TransientFailureCode {
  return (TRANSIENT_FAILURE_CODES as readonly string[]).includes(code);
}
