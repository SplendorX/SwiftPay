/**
 * RecurePay planning: run projection, monthly commitment, the compose form.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/recurring/__tests__/recurepay-plan.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeCadence,
  isOneTime,
  monthlyCommitment,
  projectRuns,
  runsLeft,
  scheduleFromCompose,
} from "@/lib/recurepay-plan";

const schedule = (overrides = {}) => ({
  amount: "100",
  ends_at: null,
  frequency: "weekly",
  id: "s1",
  interval_days: null,
  max_runs: null,
  next_run_at: "2026-10-06T09:00:00.000Z",
  run_count: 0,
  status: "active",
  token_symbol: "USDC",
  ...overrides,
});

describe("projectRuns", () => {
  it("steps by the cadence from the next run", () => {
    const runs = projectRuns(schedule(), { limit: 3 }).map((date) => date.toISOString().slice(0, 10));
    assert.deepEqual(runs, ["2026-10-06", "2026-10-13", "2026-10-20"]);
  });

  it("stops at the end date, the run cap and the window", () => {
    assert.equal(projectRuns(schedule({ ends_at: "2026-10-14T00:00:00.000Z" })).length, 2);
    assert.equal(projectRuns(schedule({ max_runs: 5, run_count: 3 })).length, 2);
    assert.equal(projectRuns(schedule(), { until: new Date("2026-10-21T00:00:00.000Z") }).length, 3);
  });

  it("projects nothing for paused or finished schedules", () => {
    assert.deepEqual(projectRuns(schedule({ status: "paused" })), []);
    assert.deepEqual(projectRuns(schedule({ max_runs: 1, run_count: 1 })), []);
  });

  it("follows a custom interval", () => {
    const runs = projectRuns(schedule({ frequency: "custom", interval_days: 10 }), { limit: 2 });
    assert.equal(runs[1].toISOString().slice(0, 10), "2026-10-16");
  });
});

describe("monthlyCommitment", () => {
  it("averages each active recurring schedule to a month, per token", () => {
    const totals = monthlyCommitment([
      schedule({ amount: "100", frequency: "monthly" }),
      schedule({ amount: "10", frequency: "weekly" }),
      schedule({ amount: "30", frequency: "quarterly", token_symbol: "EURC" }),
      schedule({ amount: "999", status: "paused" }),
      schedule({ amount: "500", max_runs: 1 }),
    ]);
    assert.ok(Math.abs(totals.USDC - (100 + (10 * 30.44) / 7)) < 1e-9);
    assert.equal(totals.EURC, 10);
  });
});

describe("runs and one-time", () => {
  it("counts what is left", () => {
    assert.equal(runsLeft({ max_runs: null, run_count: 4 }), null);
    assert.equal(runsLeft({ max_runs: 6, run_count: 4 }), 2);
    assert.equal(isOneTime({ max_runs: 1 }), true);
  });
});

describe("describeCadence", () => {
  const monday = new Date(2026, 9, 5, 9, 0);
  it("says when it runs", () => {
    assert.equal(describeCadence({ frequency: "weekly", oneTime: false, startsAt: monday }), "Every Monday");
    assert.equal(describeCadence({ frequency: "monthly", oneTime: false, startsAt: monday }), "Monthly on the 5th");
    assert.equal(describeCadence({ frequency: "biweekly", oneTime: false, startsAt: monday }), "Every other Monday");
    assert.equal(describeCadence({ frequency: "monthly", oneTime: true, startsAt: monday }), "Once, on 5 Oct 2026");
  });
});

describe("scheduleFromCompose", () => {
  const now = new Date(2026, 9, 5, 8, 0).getTime();
  const base = { date: "2026-10-10", endDate: "", frequency: "monthly", intervalDays: "", payments: "", time: "", type: "recurring" };

  it("defaults the time to 09:00", () => {
    const result = scheduleFromCompose(base, now);
    assert.equal(result.ok, true);
    assert.equal(result.startsAt.getHours(), 9);
  });

  it("makes a one-time payment a single run", () => {
    const result = scheduleFromCompose({ ...base, type: "one-time" }, now);
    assert.equal(result.ok && result.maxRuns, 1);
  });

  it("refuses the past, a backwards end date, and bad intervals", () => {
    assert.equal(scheduleFromCompose({ ...base, date: "2026-10-01" }, now).ok, false);
    assert.equal(scheduleFromCompose({ ...base, endDate: "2026-10-09" }, now).ok, false);
    assert.equal(scheduleFromCompose({ ...base, frequency: "custom", intervalDays: "0" }, now).ok, false);
    assert.equal(scheduleFromCompose({ ...base, payments: "1.5" }, now).ok, false);
    assert.equal(scheduleFromCompose({ ...base, date: "" }, now).ok, false);
  });

  it("keeps an end date and a payment count", () => {
    const result = scheduleFromCompose({ ...base, endDate: "2027-03-31", payments: "6" }, now);
    assert.equal(result.ok && result.maxRuns, 6);
    assert.equal(result.ok && result.endsAt?.getMonth(), 2);
  });
});
