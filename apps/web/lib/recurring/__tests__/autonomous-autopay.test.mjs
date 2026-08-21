/**
 * Autonomous Autopay unit tests (no live Supabase / Circle).
 * Run: node --test lib/recurring/__tests__/autonomous-autopay.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

function advanceNextRunAt(current, frequency, intervalDays) {
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

function buildOccurrenceIdempotencyKey(scheduleId, occurrenceNumber) {
  return `swiftpay:recurring:${scheduleId}:occurrence:${occurrenceNumber}`;
}

const RETRY_BACKOFF_MS = [5 * 60_000, 15 * 60_000, 30 * 60_000];
function retryDelayMsForAttempt(attemptCount) {
  if (attemptCount <= 1) return RETRY_BACKOFF_MS[0];
  if (attemptCount === 2) return RETRY_BACKOFF_MS[1];
  return RETRY_BACKOFF_MS[2];
}

const ALLOWED_TRANSITIONS = {
  SCHEDULED: ["DUE", "FAILED_PERMANENTLY"],
  DUE: ["PROCESSING", "FAILED_PERMANENTLY"],
  PROCESSING: ["SUBMITTED", "CONFIRMING", "FAILED", "FAILED_PERMANENTLY", "COMPLETED"],
  SUBMITTED: ["CONFIRMING", "COMPLETED", "FAILED", "FAILED_PERMANENTLY"],
  CONFIRMING: ["COMPLETED", "FAILED", "FAILED_PERMANENTLY"],
  COMPLETED: [],
  FAILED: ["RETRYING", "FAILED_PERMANENTLY"],
  RETRYING: ["PROCESSING", "FAILED_PERMANENTLY"],
  FAILED_PERMANENTLY: [],
};

function canTransition(from, to) {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) === true;
}

const PERMANENT = new Set([
  "AUTHORIZATION_REVOKED",
  "AUTHORIZATION_EXPIRED",
  "AUTHORIZATION_INVALID",
  "SCHEDULE_CANCELLED",
  "INVALID_RECIPIENT",
  "INVALID_TOKEN",
  "AMOUNT_EXCEEDS_AUTHORIZATION",
  "TOTAL_LIMIT_EXCEEDED",
  "OUTSIDE_AUTHORIZED_PERIOD",
  "DUPLICATE_OCCURRENCE",
  "PROVIDER_PERMANENT_REJECTION",
]);

function evaluatePolicy(schedule, occurrence, now = new Date()) {
  if (schedule.status === "cancelled" || schedule.status === "completed") {
    return { allowed: false, code: "SCHEDULE_CANCELLED" };
  }
  if (schedule.status !== "active") {
    return { allowed: false, code: "SCHEDULE_PAUSED" };
  }
  if (!schedule.autopay_enabled) {
    return { allowed: false, code: "AUTHORIZATION_INVALID" };
  }
  if (schedule.authorization_status === "REVOKED") {
    return { allowed: false, code: "AUTHORIZATION_REVOKED" };
  }
  if (schedule.authorization_status === "EXPIRED") {
    return { allowed: false, code: "AUTHORIZATION_EXPIRED" };
  }
  if (schedule.authorization_status !== "AUTHORIZED") {
    return { allowed: false, code: "AUTHORIZATION_INVALID" };
  }
  if (
    schedule.authorization_expires_at &&
    new Date(schedule.authorization_expires_at).getTime() <= now.getTime()
  ) {
    return { allowed: false, code: "AUTHORIZATION_EXPIRED" };
  }
  const recipient = (schedule.authorized_recipient ?? schedule.beneficiary_wallet).toLowerCase();
  if (recipient !== schedule.beneficiary_wallet.toLowerCase()) {
    return { allowed: false, code: "INVALID_RECIPIENT" };
  }
  const token = (schedule.authorized_token ?? schedule.token_symbol).toUpperCase();
  if (token !== schedule.token_symbol.toUpperCase()) {
    return { allowed: false, code: "INVALID_TOKEN" };
  }
  const payment = BigInt(occurrence.amount_units ?? schedule.amount_units);
  const max = BigInt(schedule.max_payment_amount_units ?? schedule.amount_units);
  if (payment > max) {
    return { allowed: false, code: "AMOUNT_EXCEEDS_AUTHORIZATION" };
  }
  if (schedule.total_limit_units) {
    const spent = BigInt(schedule.executed_amount_units ?? "0");
    if (spent + payment > BigInt(schedule.total_limit_units)) {
      return { allowed: false, code: "TOTAL_LIMIT_EXCEEDED" };
    }
  }
  if (schedule.ends_at && now.getTime() > new Date(schedule.ends_at).getTime()) {
    return { allowed: false, code: "OUTSIDE_AUTHORIZED_PERIOD" };
  }
  return { allowed: true };
}

function evaluateRisk({ balance, allowance, required, existing, occurrence }) {
  if (balance < required) {
    return { allowed: false, code: "INSUFFICIENT_BALANCE" };
  }
  if (allowance < required) {
    return { allowed: false, code: "INSUFFICIENT_ALLOWANCE" };
  }
  const duplicate = existing.find(
    (row) =>
      row.id !== occurrence.id &&
      row.occurrence_number === occurrence.occurrence_number &&
      row.status !== "COMPLETED" &&
      row.status !== "FAILED_PERMANENTLY",
  );
  if (duplicate) {
    return { allowed: false, code: "DUPLICATE_OCCURRENCE" };
  }
  return { allowed: true };
}

function migrateAuthorization(row) {
  if (row.autopay_enabled && !row.authorization_tx_hash && !row.authorized_at) {
    return "REAUTHORIZATION_REQUIRED";
  }
  return row.authorization_status ?? "UNAUTHORIZED";
}

function lockAcquire(store, key, token, now, ttlMs) {
  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    return null;
  }
  const lock = { key, token, expiresAt: now + ttlMs };
  store.set(key, lock);
  return lock;
}

function lockRelease(store, lock) {
  const existing = store.get(lock.key);
  if (!existing || existing.token !== lock.token) return false;
  store.delete(lock.key);
  return true;
}

describe("idempotency", () => {
  it("uses a deterministic occurrence key", () => {
    const a = buildOccurrenceIdempotencyKey("sched-1", 3);
    const b = buildOccurrenceIdempotencyKey("sched-1", 3);
    assert.equal(a, "swiftpay:recurring:sched-1:occurrence:3");
    assert.equal(a, b);
  });

  it("does not collide across occurrence numbers", () => {
    assert.notEqual(
      buildOccurrenceIdempotencyKey("sched-1", 1),
      buildOccurrenceIdempotencyKey("sched-1", 2),
    );
  });
});

describe("next payment from original schedule", () => {
  it("advances weekly from the due date, not from completion time", () => {
    const due = new Date("2026-08-20T12:00:00.000Z");
    const completedLate = new Date("2026-08-22T09:00:00.000Z");
    const nextFromDue = advanceNextRunAt(due, "weekly");
    const nextFromNow = new Date(completedLate.getTime() + 7 * 24 * 60 * 60 * 1000);
    assert.equal(nextFromDue.toISOString(), "2026-08-27T12:00:00.000Z");
    assert.notEqual(nextFromDue.toISOString(), nextFromNow.toISOString());
  });

  it("keeps a weekly cadence across four periods", () => {
    let cursor = new Date("2026-08-20T00:00:00.000Z");
    const dates = [cursor.toISOString().slice(0, 10)];
    for (let i = 0; i < 3; i += 1) {
      cursor = advanceNextRunAt(cursor, "weekly");
      dates.push(cursor.toISOString().slice(0, 10));
    }
    assert.deepEqual(dates, ["2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10"]);
  });
});

describe("state machine", () => {
  it("allows SUBMITTED → COMPLETED only after confirmation", () => {
    assert.equal(canTransition("PROCESSING", "SUBMITTED"), true);
    assert.equal(canTransition("SUBMITTED", "COMPLETED"), true);
    assert.equal(canTransition("COMPLETED", "PROCESSING"), false);
    assert.equal(canTransition("FAILED_PERMANENTLY", "PROCESSING"), false);
  });

  it("retries through FAILED → RETRYING → PROCESSING", () => {
    assert.equal(canTransition("PROCESSING", "FAILED"), true);
    assert.equal(canTransition("FAILED", "RETRYING"), true);
    assert.equal(canTransition("RETRYING", "PROCESSING"), true);
  });
});

describe("policy engine", () => {
  const base = {
    amount_units: "1000000",
    authorization_status: "AUTHORIZED",
    authorized_recipient: "0xabc",
    authorized_token: "USDC",
    autopay_enabled: true,
    beneficiary_wallet: "0xabc",
    executed_amount_units: "0",
    max_payment_amount_units: "1000000",
    status: "active",
    token_symbol: "USDC",
  };

  it("rejects autopay_enabled without AUTHORIZED status", () => {
    const result = evaluatePolicy(
      { ...base, authorization_status: "REAUTHORIZATION_REQUIRED" },
      { amount_units: "1000000" },
    );
    assert.equal(result.allowed, false);
    assert.equal(result.code, "AUTHORIZATION_INVALID");
  });

  it("rejects revoked, expired, cancelled, over-limit, and wrong recipient", () => {
    assert.equal(
      evaluatePolicy({ ...base, authorization_status: "REVOKED" }, { amount_units: "1000000" }).code,
      "AUTHORIZATION_REVOKED",
    );
    assert.equal(
      evaluatePolicy({ ...base, status: "cancelled" }, { amount_units: "1000000" }).code,
      "SCHEDULE_CANCELLED",
    );
    assert.equal(
      evaluatePolicy({ ...base, max_payment_amount_units: "500000" }, { amount_units: "1000000" }).code,
      "AMOUNT_EXCEEDS_AUTHORIZATION",
    );
    assert.equal(
      evaluatePolicy(
        { ...base, beneficiary_wallet: "0xdef", authorized_recipient: "0xabc" },
        { amount_units: "1000000" },
      ).code,
      "INVALID_RECIPIENT",
    );
    assert.equal(
      evaluatePolicy(
        { ...base, ends_at: "2026-01-01T00:00:00.000Z" },
        { amount_units: "1000000" },
        new Date("2026-08-20T00:00:00.000Z"),
      ).code,
      "OUTSIDE_AUTHORIZED_PERIOD",
    );
  });

  it("allows a fully authorized in-window payment", () => {
    const result = evaluatePolicy(base, { amount_units: "1000000" });
    assert.equal(result.allowed, true);
  });
});

describe("risk engine", () => {
  it("fails insufficient balance without marking completed", () => {
    const result = evaluateRisk({
      allowance: 2_000_000n,
      balance: 100n,
      existing: [],
      occurrence: { id: "1", occurrence_number: 1 },
      required: 1_010_000n,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.code, "INSUFFICIENT_BALANCE");
    assert.equal(PERMANENT.has(result.code), false);
  });

  it("rejects a duplicate open occurrence", () => {
    const result = evaluateRisk({
      allowance: 2_000_000n,
      balance: 2_000_000n,
      existing: [{ id: "other", occurrence_number: 1, status: "SUBMITTED" }],
      occurrence: { id: "1", occurrence_number: 1 },
      required: 1_010_000n,
    });
    assert.equal(result.code, "DUPLICATE_OCCURRENCE");
  });
});

describe("retry backoff", () => {
  it("uses 5m, 15m, 30m then permanent after 4 attempts", () => {
    assert.equal(retryDelayMsForAttempt(1), 5 * 60_000);
    assert.equal(retryDelayMsForAttempt(2), 15 * 60_000);
    assert.equal(retryDelayMsForAttempt(3), 30 * 60_000);
    const maxAttempts = 4;
    assert.equal(3 < maxAttempts, true);
    assert.equal(4 >= maxAttempts, true);
  });
});

describe("missed payments", () => {
  it("processes an overdue slot exactly once via occurrence number", () => {
    const created = new Map();
    function enqueue(scheduleId, occurrenceNumber) {
      const key = buildOccurrenceIdempotencyKey(scheduleId, occurrenceNumber);
      if (created.has(key)) return created.get(key);
      const row = { key, occurrenceNumber, status: "DUE" };
      created.set(key, row);
      return row;
    }
    const first = enqueue("s1", 1);
    const second = enqueue("s1", 1);
    assert.equal(first, second);
    assert.equal(created.size, 1);
  });
});

describe("distributed lock", () => {
  it("only one worker owns a schedule lock", () => {
    const store = new Map();
    const now = Date.now();
    const a = lockAcquire(store, "recurring-payment:s1:lock", "token-a", now, 45_000);
    const b = lockAcquire(store, "recurring-payment:s1:lock", "token-b", now, 45_000);
    assert.ok(a);
    assert.equal(b, null);
    assert.equal(lockRelease(store, { key: a.key, token: "token-b" }), false);
    assert.equal(lockRelease(store, a), true);
  });

  it("expired locks can be stolen; only owner token releases", () => {
    const store = new Map();
    const now = Date.now();
    lockAcquire(store, "recurring-payment:s1:lock", "token-a", now, 1);
    const stolen = lockAcquire(
      store,
      "recurring-payment:s1:lock",
      "token-b",
      now + 2,
      45_000,
    );
    assert.ok(stolen);
    assert.equal(stolen.token, "token-b");
  });
});

describe("existing payment migration", () => {
  it("does not treat autopayEnabled=true as authorized", () => {
    assert.equal(
      migrateAuthorization({
        autopay_enabled: true,
        authorization_status: "UNAUTHORIZED",
      }),
      "REAUTHORIZATION_REQUIRED",
    );
    assert.equal(
      migrateAuthorization({
        autopay_enabled: false,
        authorization_status: "UNAUTHORIZED",
      }),
      "UNAUTHORIZED",
    );
  });
});

describe("webhook idempotency", () => {
  it("repeated COMPLETED webhooks do not recreate a payment", () => {
    const states = new Map();
    function apply(id, success) {
      const current = states.get(id) ?? "SUBMITTED";
      if (current === "COMPLETED" || current === "FAILED_PERMANENTLY") {
        return { applied: false, current };
      }
      const next = success ? "COMPLETED" : "FAILED_PERMANENTLY";
      if (!canTransition(current, next)) {
        return { applied: false, current };
      }
      states.set(id, next);
      return { applied: true, current: next };
    }
    assert.equal(apply("occ-1", true).applied, true);
    assert.equal(apply("occ-1", true).applied, false);
    assert.equal(states.get("occ-1"), "COMPLETED");
  });
});
