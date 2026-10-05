/**
 * RecurePay planning: what a schedule will do next, in words and dates.
 * Pure (no network, no React), shared by the page and its tests. Runs are
 * projected with the server's own `advanceNextRunAt`, so the dates shown are
 * the dates the scheduler will use.
 */
import {
  advanceNextRunAt,
  formatFrequencyLabel,
  type RecurringFrequency,
  type RecurringScheduleRecord,
} from "@/lib/recurring-utils";

export type ScheduleType = "one-time" | "recurring";

type PlanSchedule = Pick<
  RecurringScheduleRecord,
  | "amount"
  | "ends_at"
  | "frequency"
  | "id"
  | "interval_days"
  | "max_runs"
  | "next_run_at"
  | "run_count"
  | "status"
  | "token_symbol"
>;

/** A one-time payment is a schedule allowed exactly one run. */
export function isOneTime(schedule: Pick<RecurringScheduleRecord, "max_runs">) {
  return schedule.max_runs === 1;
}

/** How many runs a schedule still has, or null when it is open-ended. */
export function runsLeft(schedule: Pick<RecurringScheduleRecord, "max_runs" | "run_count">) {
  if (!schedule.max_runs || schedule.max_runs <= 0) return null;
  return Math.max(0, schedule.max_runs - schedule.run_count);
}

/**
 * The schedule's next runs, oldest first, from its next run up to `until`
 * (and at most `limit`). Paused, cancelled and finished schedules have none.
 */
export function projectRuns(
  schedule: PlanSchedule,
  options: { until?: Date; limit?: number } = {},
): Date[] {
  if (schedule.status !== "active") return [];
  const limit = options.limit ?? 12;
  const until = options.until?.getTime() ?? Number.POSITIVE_INFINITY;
  const ends = schedule.ends_at ? Date.parse(schedule.ends_at) : Number.POSITIVE_INFINITY;
  const left = runsLeft(schedule);
  const cap = Math.min(limit, left ?? limit);
  const runs: Date[] = [];
  let at = new Date(schedule.next_run_at);
  while (runs.length < cap && Number.isFinite(at.getTime()) && at.getTime() <= until && at.getTime() <= ends) {
    runs.push(at);
    at = advanceNextRunAt(at, schedule.frequency, schedule.interval_days);
  }
  return runs;
}

/** Average runs per month for a cadence (a month is 30.44 days). */
export function runsPerMonth(frequency: RecurringFrequency, intervalDays?: number | null) {
  switch (frequency) {
    case "daily":
      return 30.44;
    case "weekly":
      return 30.44 / 7;
    case "biweekly":
      return 30.44 / 14;
    case "monthly":
      return 1;
    case "quarterly":
      return 1 / 3;
    default:
      return 30.44 / (intervalDays && intervalDays > 0 ? intervalDays : 30);
  }
}

/**
 * What active recurring schedules cost a month on average, per token.
 * One-time payments are left out: they aren't a monthly commitment.
 */
export function monthlyCommitment(schedules: readonly PlanSchedule[]) {
  const totals: Partial<Record<string, number>> = {};
  for (const schedule of schedules) {
    if (schedule.status !== "active" || isOneTime(schedule)) continue;
    const amount = Number(schedule.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    totals[schedule.token_symbol] =
      (totals[schedule.token_symbol] ?? 0) + amount * runsPerMonth(schedule.frequency, schedule.interval_days);
  }
  return totals;
}

const weekday = (date: Date) => date.toLocaleDateString("en-US", { weekday: "long" });

function ordinal(day: number) {
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}

/** "Every Monday", "Monthly on the 5th", "Once, on 12 Oct": the cadence in words. */
export function describeCadence(input: {
  frequency: RecurringFrequency;
  intervalDays?: number | null;
  oneTime: boolean;
  startsAt: Date;
}) {
  const { startsAt } = input;
  if (input.oneTime) {
    return `Once, on ${startsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  switch (input.frequency) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Every ${weekday(startsAt)}`;
    case "biweekly":
      return `Every other ${weekday(startsAt)}`;
    case "monthly":
      return `Monthly on the ${ordinal(startsAt.getDate())}`;
    case "quarterly":
      return `Every 3 months on the ${ordinal(startsAt.getDate())}`;
    default:
      return formatFrequencyLabel(input.frequency, input.intervalDays);
  }
}

// ── The compose form ────────────────────────────────────────────────────────

export type ComposeSchedule = {
  type: ScheduleType;
  frequency: RecurringFrequency;
  intervalDays: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, optional (defaults to 09:00) */
  time: string;
  /** YYYY-MM-DD, optional, recurring only */
  endDate: string;
  /** Optional number of payments, recurring only */
  payments: string;
};

export const DEFAULT_RUN_TIME = "09:00";

/** The schedule fields the API takes, or the first thing wrong with the form. */
export function scheduleFromCompose(
  compose: ComposeSchedule,
  now = Date.now(),
):
  | {
      ok: true;
      startsAt: Date;
      endsAt: Date | null;
      frequency: RecurringFrequency;
      intervalDays: number | null;
      maxRuns: number | null;
    }
  | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(compose.date)) {
    return { error: compose.type === "one-time" ? "Choose the payment date." : "Choose a start date.", ok: false };
  }
  const time = compose.time && /^\d{2}:\d{2}$/.test(compose.time) ? compose.time : DEFAULT_RUN_TIME;
  const startsAt = new Date(`${compose.date}T${time}`);
  if (!Number.isFinite(startsAt.getTime())) return { error: "That date isn't valid.", ok: false };
  // A minute of grace for a form filled in right at the start time.
  if (startsAt.getTime() < now - 60_000) {
    return { error: "Pick a date and time in the future.", ok: false };
  }

  if (compose.type === "one-time") {
    return { endsAt: null, frequency: "monthly", intervalDays: null, maxRuns: 1, ok: true, startsAt };
  }

  let intervalDays: number | null = null;
  if (compose.frequency === "custom") {
    intervalDays = Number(compose.intervalDays);
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
      return { error: "Repeat every 1 to 365 days.", ok: false };
    }
  }

  let endsAt: Date | null = null;
  if (compose.endDate) {
    endsAt = new Date(`${compose.endDate}T23:59`);
    if (!Number.isFinite(endsAt.getTime())) return { error: "That end date isn't valid.", ok: false };
    if (endsAt.getTime() < startsAt.getTime()) return { error: "The end date must be after the start date.", ok: false };
  }

  let maxRuns: number | null = null;
  if (compose.payments) {
    maxRuns = Number(compose.payments);
    if (!Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > 9999) {
      return { error: "Number of payments must be between 1 and 9,999.", ok: false };
    }
  }

  return { endsAt, frequency: compose.frequency, intervalDays, maxRuns, ok: true, startsAt };
}
