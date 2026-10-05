/**
 * Insights: money in and out per day and per feature for a calendar month.
 * Pure, so the server route and the tests run exactly this.
 */
import type { ActivityFeed } from "@/lib/activity/types";

export type InsightToken = "USDC" | "EURC";
export type TokenSums = Partial<Record<InsightToken, number>>;

export type MonthSummary = {
  /** YYYY-MM in the viewer's time zone. */
  month: string;
  /** Days elapsed in the month so far (all of them for a past month). */
  daysElapsed: number;
  daysInMonth: number;
  /** Index 0 is the 1st of the month. */
  days: Array<{ in: TokenSums; out: TokenSums }>;
  totals: { in: TokenSums; out: TokenSums; count: number };
  /** Money out and in per feature, most spent first. */
  categories: Array<{ source: ActivityFeed; in: TokenSums; out: TokenSums; count: number }>;
};

type SummaryItem = {
  source: ActivityFeed;
  direction: "in" | "out" | "internal";
  amount: string | null;
  token: string | null;
  occurredAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isToken(value: string | null | undefined): value is InsightToken {
  return value === "USDC" || value === "EURC";
}

function add(sums: TokenSums, token: InsightToken, amount: number) {
  sums[token] = (sums[token] ?? 0) + amount;
}

/** YYYY-MM for the month containing `at`, in a zone `tzOffsetMinutes` behind UTC (Date#getTimezoneOffset). */
export function monthKey(at: number, tzOffsetMinutes: number) {
  const local = new Date(at - tzOffsetMinutes * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month before `month` (YYYY-MM). */
export function previousMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber === 1 ? `${year - 1}-12` : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

/** The instants a local calendar month starts and ends, as UTC. */
export function monthRange(month: string, tzOffsetMinutes: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const offset = tzOffsetMinutes * 60_000;
  const from = new Date(Date.UTC(year, monthNumber - 1, 1) + offset);
  const next = new Date(Date.UTC(year, monthNumber, 1) + offset);
  const daysInMonth = Math.round((Date.UTC(year, monthNumber, 1) - Date.UTC(year, monthNumber - 1, 1)) / DAY_MS);
  return { daysInMonth, from, to: new Date(next.getTime() - 1) };
}

export function summarizeMonth(
  items: readonly SummaryItem[],
  month: string,
  tzOffsetMinutes: number,
  now = Date.now(),
): MonthSummary {
  const { daysInMonth, from, to } = monthRange(month, tzOffsetMinutes);
  const daysElapsed =
    now >= to.getTime() ? daysInMonth : Math.max(0, Math.min(daysInMonth, Math.floor((now - from.getTime()) / DAY_MS) + 1));
  const days = Array.from({ length: daysInMonth }, () => ({ in: {} as TokenSums, out: {} as TokenSums }));
  const totals = { count: 0, in: {} as TokenSums, out: {} as TokenSums };
  const categories = new Map<ActivityFeed, { in: TokenSums; out: TokenSums; count: number }>();

  for (const item of items) {
    // Moves between your own accounts are neither income nor spending.
    if (item.direction === "internal") continue;
    const token = item.token?.toUpperCase();
    if (!isToken(token)) continue;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const at = item.occurredAt ? Date.parse(item.occurredAt) : Number.NaN;
    if (Number.isNaN(at) || at < from.getTime() || at > to.getTime()) continue;

    const day = Math.min(daysInMonth - 1, Math.floor((at - from.getTime()) / DAY_MS));
    add(days[day][item.direction], token, amount);
    add(totals[item.direction], token, amount);
    totals.count += 1;
    const category = categories.get(item.source) ?? { count: 0, in: {}, out: {} };
    add(category[item.direction], token, amount);
    category.count += 1;
    categories.set(item.source, category);
  }

  const spent = (sums: TokenSums) => (sums.USDC ?? 0) + (sums.EURC ?? 0);
  return {
    categories: [...categories.entries()]
      .map(([source, value]) => ({ source, ...value }))
      .sort((left, right) => spent(right.out) - spent(left.out) || spent(right.in) - spent(left.in)),
    days,
    daysElapsed,
    daysInMonth,
    month,
    totals,
  };
}
