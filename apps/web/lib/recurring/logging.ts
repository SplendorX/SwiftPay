type RecurringLogEvent =
  | "recurring.scheduler.tick"
  | "recurring.scheduler.enqueued"
  | "recurring.scheduler.skipped"
  | "recurring.execution.start"
  | "recurring.execution.lock"
  | "recurring.execution.policy"
  | "recurring.execution.risk"
  | "recurring.execution.submitted"
  | "recurring.execution.completed"
  | "recurring.execution.failed"
  | "recurring.execution.retry"
  | "recurring.webhook"
  | "recurring.reconcile";

const SENSITIVE_KEY =
  /private[_-]?key|seed|secret|password|authorization[_-]?material|entity[_-]?secret|api[_-]?key|cipher/i;

function redact(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nested]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : redact(nested)],
    );
    return Object.fromEntries(entries);
  }
  return value;
}

export function logRecurringEvent(
  event: RecurringLogEvent,
  fields: Record<string, unknown>,
) {
  const payload = redact({
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  });
  console.info(JSON.stringify(payload));
}
