/**
 * Fixed vs flexible pocket lock helpers.
 * Run: node --test lib/save/__tests__/lock.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const MIN_LOCK_DAYS = 1;
const MAX_LOCK_DAYS = 365 * 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function lockUntilFromDays(days, from = new Date()) {
  const safeDays = Math.max(MIN_LOCK_DAYS, Math.min(MAX_LOCK_DAYS, days));
  return new Date(from.getTime() + safeDays * MS_PER_DAY);
}

function getPocketLockState(pocket, now = new Date()) {
  const kind = pocket.lock_kind === "fixed" ? "fixed" : "flexible";
  if (kind === "flexible") return { kind: "flexible", locked: false };
  const until = pocket.lock_until ? new Date(pocket.lock_until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= now.getTime()) {
    return { kind: "fixed", locked: false, until };
  }
  return {
    kind: "fixed",
    locked: true,
    until,
    remainingMs: until.getTime() - now.getTime(),
  };
}

function parseLockRequest(body) {
  const hasKind = body.lockKind !== undefined && body.lockKind !== null;
  const hasDays = body.lockDays !== undefined && body.lockDays !== null && body.lockDays !== "";
  const hasUntil = body.lockUntil !== undefined && body.lockUntil !== null && body.lockUntil !== "";
  if (!hasKind && !hasDays && !hasUntil) return { ok: true, value: null };
  const kind = hasKind ? body.lockKind : hasDays || hasUntil ? "fixed" : "flexible";
  if (kind !== "flexible" && kind !== "fixed") {
    return { ok: false, error: "Choose flexible or fixed savings." };
  }
  if (kind === "flexible") return { ok: true, value: { kind: "flexible" } };
  const now = body.now ?? new Date();
  if (hasDays) {
    const raw = Number(body.lockDays);
    if (!Number.isInteger(raw) || raw < MIN_LOCK_DAYS || raw > MAX_LOCK_DAYS) {
      return { ok: false, error: "bad days" };
    }
    return {
      ok: true,
      value: {
        kind: "fixed",
        until: lockUntilFromDays(raw, now).toISOString(),
        days: raw,
      },
    };
  }
  return { ok: false, error: "Choose how long this fixed pocket should stay locked." };
}

function applyLockChange(existing, next, now = new Date()) {
  const current = getPocketLockState(existing, now);
  if (current.locked) {
    return { error: "locked" };
  }
  if (next.kind === "flexible") {
    return {
      patch: { lock_kind: "flexible", lock_until: null, lock_duration_days: null },
    };
  }
  return {
    patch: {
      lock_kind: "fixed",
      lock_until: next.until,
      lock_duration_days: next.days,
    },
  };
}

describe("lock helpers", () => {
  it("treats missing lock fields as flexible", () => {
    const state = getPocketLockState({ name: "Emergency" });
    assert.equal(state.kind, "flexible");
    assert.equal(state.locked, false);
  });

  it("locks a fixed pocket until the unlock time", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    const until = new Date("2026-09-14T12:00:00.000Z");
    const state = getPocketLockState(
      { lock_kind: "fixed", lock_until: until.toISOString() },
      now,
    );
    assert.equal(state.locked, true);
    assert.equal(state.kind, "fixed");
  });

  it("unlocks a fixed pocket after the term", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const until = new Date("2026-09-14T12:00:00.000Z");
    const state = getPocketLockState(
      { lock_kind: "fixed", lock_until: until.toISOString() },
      now,
    );
    assert.equal(state.locked, false);
  });

  it("computes a 30-day lock from now", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const until = lockUntilFromDays(30, from);
    assert.equal(until.toISOString(), "2026-01-31T00:00:00.000Z");
  });

  it("rejects a lock shorter than one day", () => {
    const parsed = parseLockRequest({ lockKind: "fixed", lockDays: 0 });
    assert.equal(parsed.ok, false);
  });

  it("blocks changing a pocket that is still locked", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    const result = applyLockChange(
      {
        lock_kind: "fixed",
        lock_until: "2026-09-14T12:00:00.000Z",
      },
      { kind: "flexible" },
      now,
    );
    assert.equal("error" in result, true);
  });

  it("lets a matured fixed pocket start a new term", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const result = applyLockChange(
      {
        lock_kind: "fixed",
        lock_until: "2026-09-14T12:00:00.000Z",
      },
      { kind: "fixed", until: "2026-10-15T12:00:00.000Z", days: 30 },
      now,
    );
    assert.equal(result.patch.lock_kind, "fixed");
    assert.equal(result.patch.lock_duration_days, 30);
  });
});
