/**
 * Pure unit tests for Swift+Save money math (no server deps).
 * Run: node --test lib/save/__tests__/decimal-target.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Inline pure helpers mirroring lib/save/decimal.ts + target.ts + eligibility.ts
// so tests run without a TS loader in CI.

function parseDecimalToUnits(value, decimals) {
  const cleaned = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error("Invalid decimal amount.");
  const [whole, fraction = ""] = cleaned.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

function formatUnitsToDecimal(units, decimals) {
  const negative = units < 0n;
  const value = negative ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}

function calculateSaveAmountUnits(paymentAmountUnits, percentage) {
  if (paymentAmountUnits <= 0n) return 0n;
  const pct =
    typeof percentage === "number" ? percentage.toFixed(2) : percentage.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(pct)) throw new Error("Invalid percentage.");
  const [whole, frac = ""] = pct.split(".");
  const hundredths = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  return (paymentAmountUnits * hundredths) / 10_000n;
}

function capSaveAmountForTarget(input) {
  const planned = input.plannedSaveUnits < 0n ? 0n : input.plannedSaveUnits;
  if (planned === 0n) {
    return { cappedUnits: 0n, reachesTarget: false, wasCapped: false, roomUnits: null };
  }
  if (input.targetAmountUnits === null || input.targetAmountUnits <= 0n) {
    return {
      cappedUnits: planned,
      reachesTarget: false,
      wasCapped: false,
      roomUnits: null,
    };
  }
  const target = input.targetAmountUnits;
  const current = input.currentBalanceUnits < 0n ? 0n : input.currentBalanceUnits;
  const room = target > current ? target - current : 0n;
  const next = current + planned;
  const reachesTarget = next >= target;
  if (!input.stopAtTarget) {
    return { cappedUnits: planned, reachesTarget, wasCapped: false, roomUnits: room };
  }
  if (room === 0n) {
    return {
      cappedUnits: 0n,
      reachesTarget: true,
      wasCapped: planned > 0n,
      roomUnits: 0n,
    };
  }
  if (planned <= room) {
    return {
      cappedUnits: planned,
      reachesTarget: planned === room,
      wasCapped: false,
      roomUnits: room,
    };
  }
  return { cappedUnits: room, reachesTarget: true, wasCapped: true, roomUnits: room };
}

function totalRequiredUnits(input) {
  return (
    input.paymentUnits +
    input.saveUnits +
    (input.networkFeeUnits ?? 0n) +
    (input.platformFeeUnits ?? 0n)
  );
}

function isEligibleOutgoingPayment(meta) {
  if (
    meta.isSavingsDeposit ||
    meta.isSavingsWithdrawal ||
    meta.isInternalTransfer ||
    meta.isFailed ||
    meta.isReversed ||
    meta.isRefund ||
    meta.isSystem
  ) {
    return false;
  }
  const kind = (meta.kind ?? "outgoing").toLowerCase();
  if (
    [
      "savings_deposit",
      "savings_withdrawal",
      "internal",
      "refund",
      "reversal",
      "system",
      "swap",
      "earn_deposit",
      "earn_withdraw",
    ].includes(kind)
  ) {
    return false;
  }
  return true;
}

describe("calculateSaveAmountUnits", () => {
  it("$100 × 5% = $5 (6 decimals)", () => {
    const payment = parseDecimalToUnits("100", 6);
    const save = calculateSaveAmountUnits(payment, "5.00");
    assert.equal(formatUnitsToDecimal(save, 6), "5");
  });

  it("$200 × 10% = $20", () => {
    const payment = parseDecimalToUnits("200", 6);
    const save = calculateSaveAmountUnits(payment, 10);
    assert.equal(formatUnitsToDecimal(save, 6), "20");
  });

  it("$1,000 × 2.5% = $25", () => {
    const payment = parseDecimalToUnits("1000", 6);
    const save = calculateSaveAmountUnits(payment, "2.50");
    assert.equal(formatUnitsToDecimal(save, 6), "25");
  });

  it("rejects zero payment", () => {
    assert.equal(calculateSaveAmountUnits(0n, "5"), 0n);
  });
});

describe("capSaveAmountForTarget", () => {
  it("caps to remaining room when stop_at_target ($990 + $20 → $10)", () => {
    const r = capSaveAmountForTarget({
      plannedSaveUnits: 20_000_000n,
      currentBalanceUnits: 990_000_000n,
      targetAmountUnits: 1_000_000_000n,
      stopAtTarget: true,
    });
    assert.equal(r.cappedUnits, 10_000_000n);
    assert.equal(r.wasCapped, true);
    assert.equal(r.reachesTarget, true);
  });

  it("continues beyond target when stop_at_target is false", () => {
    const r = capSaveAmountForTarget({
      plannedSaveUnits: 20_000_000n,
      currentBalanceUnits: 990_000_000n,
      targetAmountUnits: 1_000_000_000n,
      stopAtTarget: false,
    });
    assert.equal(r.cappedUnits, 20_000_000n);
    assert.equal(r.wasCapped, false);
  });

  it("saves zero when already at target and stop enabled", () => {
    const r = capSaveAmountForTarget({
      plannedSaveUnits: 5_000_000n,
      currentBalanceUnits: 1_000_000_000n,
      targetAmountUnits: 1_000_000_000n,
      stopAtTarget: true,
    });
    assert.equal(r.cappedUnits, 0n);
  });
});

describe("totalRequiredUnits", () => {
  it("payment + save + fees = $105.10", () => {
    const total = totalRequiredUnits({
      paymentUnits: 100_000_000n,
      saveUnits: 5_000_000n,
      networkFeeUnits: 100_000n,
      platformFeeUnits: 0n,
    });
    assert.equal(total, 105_100_000n);
  });
});

describe("isEligibleOutgoingPayment", () => {
  it("allows normal outgoing", () => {
    assert.equal(isEligibleOutgoingPayment({ kind: "outgoing" }), true);
  });
  it("excludes savings deposits and refunds", () => {
    assert.equal(isEligibleOutgoingPayment({ isSavingsDeposit: true }), false);
    assert.equal(isEligibleOutgoingPayment({ isRefund: true }), false);
    assert.equal(isEligibleOutgoingPayment({ kind: "refund" }), false);
  });
});
