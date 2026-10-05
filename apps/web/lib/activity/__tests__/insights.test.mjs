/**
 * Insights: month boundaries in the viewer's zone, and what counts.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/activity/__tests__/insights.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { monthKey, monthRange, periodRange, previousMonthKey, summarizeMonth, summarizePeriod } from "@/lib/activity/insights";

const item = (overrides) => ({
  amount: "10",
  direction: "out",
  occurredAt: "2026-10-03T12:00:00.000Z",
  source: "send",
  token: "USDC",
  ...overrides,
});

describe("months", () => {
  it("follows the viewer's clock", () => {
    // 23:30 UTC on Sep 30 is already Oct 1 in Lagos (UTC+1, offset -60).
    const at = Date.parse("2026-09-30T23:30:00.000Z");
    assert.equal(monthKey(at, 0), "2026-09");
    assert.equal(monthKey(at, -60), "2026-10");
  });

  it("knows the previous month across a year", () => {
    assert.equal(previousMonthKey("2026-10"), "2026-09");
    assert.equal(previousMonthKey("2026-01"), "2025-12");
  });

  it("spans the local month", () => {
    const { from, to, daysInMonth } = monthRange("2026-02", -60);
    assert.equal(daysInMonth, 28);
    assert.equal(from.toISOString(), "2026-01-31T23:00:00.000Z");
    assert.equal(to.toISOString(), "2026-02-28T22:59:59.999Z");
  });
});

describe("summarizeMonth", () => {
  const now = Date.parse("2026-10-05T09:00:00.000Z");

  it("adds money in and out per day and per token", () => {
    const summary = summarizeMonth(
      [
        item({}),
        item({ amount: "5", occurredAt: "2026-10-03T18:00:00.000Z" }),
        item({ amount: "20", direction: "in", source: "invoice" }),
        item({ amount: "8", token: "EURC" }),
      ],
      "2026-10",
      0,
      now,
    );
    assert.equal(summary.daysInMonth, 31);
    assert.equal(summary.daysElapsed, 5);
    assert.deepEqual(summary.days[2], { in: { USDC: 20 }, out: { EURC: 8, USDC: 15 } });
    assert.deepEqual(summary.totals, { count: 4, in: { USDC: 20 }, out: { EURC: 8, USDC: 15 } });
  });

  it("skips internal moves, other months, other tokens and junk amounts", () => {
    const summary = summarizeMonth(
      [
        item({ direction: "internal" }),
        item({ occurredAt: "2026-09-30T12:00:00.000Z" }),
        item({ token: "ETH" }),
        item({ amount: null }),
        item({ amount: "-3" }),
      ],
      "2026-10",
      0,
      now,
    );
    assert.equal(summary.totals.count, 0);
  });

  it("ranks categories by money out", () => {
    const summary = summarizeMonth(
      [item({ amount: "3", source: "swap" }), item({ amount: "30", source: "send" }), item({ amount: "9", source: "swap" })],
      "2026-10",
      0,
      now,
    );
    assert.deepEqual(
      summary.categories.map((category) => [category.source, category.out.USDC, category.count]),
      [
        ["send", 30, 1],
        ["swap", 12, 2],
      ],
    );
  });

  it("counts every day of a past month as elapsed", () => {
    assert.equal(summarizeMonth([], "2026-09", 0, now).daysElapsed, 30);
  });
});

describe("30-day periods", () => {
  const now = Date.parse("2026-10-05T10:00:00.000Z");

  it("ends today and spans 30 whole local days", () => {
    const { from, to } = periodRange(now, -60, 30);
    // Lagos midnight on Sep 6 is 23:00 UTC on Sep 5.
    assert.equal(from.toISOString(), "2026-09-05T23:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-05T22:59:59.999Z");
  });

  it("counts this period and the one before separately", () => {
    const items = [
      item({ occurredAt: "2026-10-04T12:00:00.000Z", amount: "5" }),
      item({ occurredAt: "2026-09-20T12:00:00.000Z", amount: "7", direction: "in", source: "wallet" }),
      item({ occurredAt: "2026-08-20T12:00:00.000Z", amount: "3" }),
      item({ occurredAt: "2026-10-04T13:00:00.000Z", amount: "9", direction: "internal" }),
    ];
    const current = summarizePeriod(items, { now, tzOffsetMinutes: 0 });
    const previous = summarizePeriod(items, { back: 1, now, tzOffsetMinutes: 0 });
    assert.equal(current.totals.count, 2);
    assert.equal(current.totals.out.USDC, 5);
    assert.equal(current.totals.in.USDC, 7);
    assert.equal(current.days.length, 30);
    assert.equal(current.days[28].out.USDC, 5); // Oct 4; index 29 is today
    assert.deepEqual(current.categories.map((c) => c.source), ["send", "wallet"]);
    assert.equal(previous.totals.count, 1);
    assert.equal(previous.totals.out.USDC, 3);
  });
});
