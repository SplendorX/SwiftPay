/**
 * Security + integration-style tests for Swift+Save (no live Supabase required).
 * Run: node --test lib/save/__tests__/security-integration.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ─── Inlined pure security helpers (mirror lib/save/security.ts) ─────────────

function assertOwnerMatch(sessionOwner, resourceOwner) {
  if (!sessionOwner || !resourceOwner) return false;
  return sessionOwner.toLowerCase() === resourceOwner.toLowerCase();
}

function assertNotCrossUser(actorWallet, resourceOwnerWallet) {
  if (actorWallet.toLowerCase() !== resourceOwnerWallet.toLowerCase()) {
    throw new Error("Forbidden: you cannot access another user's savings.");
  }
}

function assertPositiveAmountUnits(units) {
  if (units <= 0n) throw new Error("Amount must be greater than zero.");
}

function assertSufficientBalance(available, required, label = "balance") {
  if (required > available) throw new Error(`Insufficient ${label}.`);
}

function assertPercentageInRange(percentage, min = 1, max = 50) {
  const text =
    typeof percentage === "number"
      ? percentage.toFixed(2)
      : String(percentage).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("Invalid percentage.");
  const [w, f = ""] = text.split(".");
  const hundredths = Number(w) * 100 + Number((f + "00").slice(0, 2));
  if (hundredths < min * 100 || hundredths > max * 100) {
    throw new Error(`Percentage must be between ${min}% and ${max}%.`);
  }
  const whole = Math.floor(hundredths / 100);
  const frac = (hundredths % 100).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

function assertIdempotencyConflict(existing, incoming) {
  if (!existing) return "create";
  if (
    existing.ownerWallet.toLowerCase() !== incoming.ownerWallet.toLowerCase() ||
    existing.pocketId !== incoming.pocketId ||
    existing.amountUnits !== incoming.amountUnits
  ) {
    throw new Error("Idempotency key conflicts with an existing transaction.");
  }
  return "reuse";
}

function assertClientAmountMatchesServer(clientUnits, serverUnits) {
  const a = typeof clientUnits === "bigint" ? clientUnits : BigInt(clientUnits);
  const b = typeof serverUnits === "bigint" ? serverUnits : BigInt(serverUnits);
  if (a !== b) throw new Error("Amount does not match server quote.");
}

function assertPocketActive(status) {
  if (status !== "active") {
    throw new Error("Cannot deposit into an archived pocket.");
  }
}

function assertTxHash(value) {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("A valid on-chain transaction hash is required.");
  }
}

function calculateSaveAmountUnits(paymentAmountUnits, percentage) {
  if (paymentAmountUnits <= 0n) return 0n;
  const pct =
    typeof percentage === "number" ? percentage.toFixed(2) : percentage.trim();
  const [whole, frac = ""] = pct.split(".");
  const hundredths = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  return (paymentAmountUnits * hundredths) / 10_000n;
}

function capSaveAmountForTarget(input) {
  const planned = input.plannedSaveUnits < 0n ? 0n : input.plannedSaveUnits;
  if (!input.targetAmountUnits || input.targetAmountUnits <= 0n) {
    return { cappedUnits: planned, wasCapped: false };
  }
  if (!input.stopAtTarget) return { cappedUnits: planned, wasCapped: false };
  const current = input.currentBalanceUnits < 0n ? 0n : input.currentBalanceUnits;
  const room =
    input.targetAmountUnits > current
      ? input.targetAmountUnits - current
      : 0n;
  if (planned <= room) return { cappedUnits: planned, wasCapped: false };
  return { cappedUnits: room, wasCapped: planned > room };
}

// ─── In-memory savings store (integration simulation) ────────────────────────

function createMemoryStore() {
  const pockets = new Map();
  const txs = new Map();
  const byIdem = new Map();

  return {
    createPocket(owner, name) {
      const id = `pocket-${pockets.size + 1}`;
      const pocket = {
        id,
        owner_wallet: owner.toLowerCase(),
        name,
        status: "active",
        current_balance_units: "0",
        stop_at_target: false,
        target_amount_units: null,
      };
      pockets.set(id, pocket);
      return pocket;
    },
    getPocket(id, owner) {
      const p = pockets.get(id);
      if (!p) return null;
      assertNotCrossUser(owner, p.owner_wallet);
      return p;
    },
    deposit(owner, pocketId, amountUnits, idempotencyKey) {
      const existing = byIdem.get(idempotencyKey);
      const decision = assertIdempotencyConflict(
        existing
          ? {
              ownerWallet: existing.owner_wallet,
              pocketId: existing.pocket_id,
              amountUnits: existing.amount_units,
            }
          : null,
        { ownerWallet: owner, pocketId, amountUnits: amountUnits.toString() },
      );
      if (decision === "reuse") return existing;

      const pocket = this.getPocket(pocketId, owner);
      if (!pocket) throw new Error("not found");
      assertPocketActive(pocket.status);
      assertPositiveAmountUnits(amountUnits);

      const id = `tx-${txs.size + 1}`;
      const tx = {
        id,
        owner_wallet: owner.toLowerCase(),
        pocket_id: pocketId,
        type: "DEPOSIT",
        amount_units: amountUnits.toString(),
        status: "PENDING",
        idempotency_key: idempotencyKey,
      };
      txs.set(id, tx);
      byIdem.set(idempotencyKey, tx);
      return tx;
    },
    confirmDeposit(owner, txId, txHash) {
      assertTxHash(txHash);
      const tx = txs.get(txId);
      if (!tx) throw new Error("not found");
      assertNotCrossUser(owner, tx.owner_wallet);
      if (tx.status === "COMPLETED") return tx;
      const pocket = pockets.get(tx.pocket_id);
      pocket.current_balance_units = (
        BigInt(pocket.current_balance_units) + BigInt(tx.amount_units)
      ).toString();
      tx.status = "COMPLETED";
      tx.tx_hash = txHash;
      return tx;
    },
    reverse(owner, originalTxId, idempotencyKey) {
      const original = txs.get(originalTxId);
      if (!original) throw new Error("not found");
      assertNotCrossUser(owner, original.owner_wallet);
      if (original.status !== "COMPLETED") {
        throw new Error("Only completed savings transactions can be reversed.");
      }
      const existing = byIdem.get(idempotencyKey);
      if (existing) return existing;

      const pocket = pockets.get(original.pocket_id);
      assertSufficientBalance(
        BigInt(pocket.current_balance_units),
        BigInt(original.amount_units),
        "pocket balance",
      );

      const id = `tx-${txs.size + 1}`;
      const rev = {
        id,
        owner_wallet: owner.toLowerCase(),
        pocket_id: original.pocket_id,
        type: "REVERSAL",
        amount_units: original.amount_units,
        status: "PENDING",
        related_savings_transaction_id: original.id,
        idempotency_key: idempotencyKey,
      };
      txs.set(id, rev);
      byIdem.set(idempotencyKey, rev);
      return rev;
    },
    confirmReversal(owner, txId, txHash) {
      assertTxHash(txHash);
      const tx = txs.get(txId);
      if (!tx || tx.type !== "REVERSAL") throw new Error("not found");
      assertNotCrossUser(owner, tx.owner_wallet);
      if (tx.status === "COMPLETED") return tx;
      const pocket = pockets.get(tx.pocket_id);
      pocket.current_balance_units = (
        BigInt(pocket.current_balance_units) - BigInt(tx.amount_units)
      ).toString();
      tx.status = "COMPLETED";
      tx.tx_hash = txHash;
      return { tx, pocket };
    },
  };
}

const HASH_A =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

// ─── Security suite ──────────────────────────────────────────────────────────

describe("security: ownership", () => {
  it("allows matching owners", () => {
    assert.equal(
      assertOwnerMatch("0xAbc", "0xabc"),
      true,
    );
  });
  it("blocks cross-user access", () => {
    assert.throws(
      () => assertNotCrossUser("0xaaa", "0xbbb"),
      /Forbidden/,
    );
  });
});

describe("security: amounts", () => {
  it("rejects zero and negative", () => {
    assert.throws(() => assertPositiveAmountUnits(0n));
    assert.throws(() => assertPositiveAmountUnits(-1n));
  });
  it("rejects insufficient balance for payment + savings", () => {
    const payment = 100_000_000n;
    const save = 5_000_000n;
    assert.throws(
      () => assertSufficientBalance(100_000_000n, payment + save, "wallet"),
      /Insufficient/,
    );
    assert.doesNotThrow(() =>
      assertSufficientBalance(105_000_000n, payment + save, "wallet"),
    );
  });
});

describe("security: percentage bounds", () => {
  it("accepts 1–50", () => {
    assert.equal(assertPercentageInRange("5"), "5.00");
    assert.equal(assertPercentageInRange(50), "50.00");
  });
  it("rejects bypass of max percentage", () => {
    assert.throws(() => assertPercentageInRange("51"), /between/);
    assert.throws(() => assertPercentageInRange(0), /between/);
    assert.throws(() => assertPercentageInRange("abc"), /Invalid/);
  });
});

describe("security: idempotency", () => {
  it("reuses same key with same payload", () => {
    const decision = assertIdempotencyConflict(
      {
        ownerWallet: "0xaaa",
        pocketId: "p1",
        amountUnits: "100",
      },
      {
        ownerWallet: "0xAAA",
        pocketId: "p1",
        amountUnits: "100",
      },
    );
    assert.equal(decision, "reuse");
  });
  it("rejects key reuse with different amount (duplicate deposit attack)", () => {
    assert.throws(
      () =>
        assertIdempotencyConflict(
          {
            ownerWallet: "0xaaa",
            pocketId: "p1",
            amountUnits: "100",
          },
          {
            ownerWallet: "0xaaa",
            pocketId: "p1",
            amountUnits: "999",
          },
        ),
      /conflicts/,
    );
  });
});

describe("security: client tampering", () => {
  it("rejects manipulated amount vs server quote", () => {
    assert.throws(
      () => assertClientAmountMatchesServer("100", "50"),
      /does not match/,
    );
  });
  it("rejects forged tx hash", () => {
    assert.throws(() => assertTxHash("0x123"), /valid on-chain/);
    assert.throws(() => assertTxHash(null), /valid on-chain/);
  });
  it("blocks deposit into archived pocket", () => {
    assert.throws(() => assertPocketActive("archived"), /archived/);
  });
});

// ─── Integration suite (in-memory) ───────────────────────────────────────────

describe("integration: pocket deposit withdraw reverse", () => {
  it("create → deposit → confirm → reverse → confirm", () => {
    const store = createMemoryStore();
    const owner = "0x1111111111111111111111111111111111111111";
    const pocket = store.createPocket(owner, "Emergency Fund");

    const dep = store.deposit(owner, pocket.id, 100_000_000n, "idem-dep-1");
    assert.equal(dep.status, "PENDING");

    // Replay same idempotency key — no double deposit intent
    const dep2 = store.deposit(owner, pocket.id, 100_000_000n, "idem-dep-1");
    assert.equal(dep2.id, dep.id);

    store.confirmDeposit(owner, dep.id, HASH_A);
    assert.equal(pocket.current_balance_units, "100000000");

    const rev = store.reverse(owner, dep.id, "idem-rev-1");
    assert.equal(rev.type, "REVERSAL");
    assert.equal(rev.status, "PENDING");
    // Balance unchanged until confirm
    assert.equal(pocket.current_balance_units, "100000000");

    store.confirmReversal(owner, rev.id, HASH_B);
    assert.equal(pocket.current_balance_units, "0");
  });

  it("blocks other user from depositing into foreign pocket", () => {
    const store = createMemoryStore();
    const owner = "0x1111111111111111111111111111111111111111";
    const attacker = "0x2222222222222222222222222222222222222222";
    const pocket = store.createPocket(owner, "Mine");
    assert.throws(
      () => store.deposit(attacker, pocket.id, 1n, "x"),
      /Forbidden/,
    );
  });

  it("Spend&Save target cap on integration quote path", () => {
    // $990 balance, $1000 target, stop_at_target, planned $20 → $10
    const r = capSaveAmountForTarget({
      plannedSaveUnits: 20_000_000n,
      currentBalanceUnits: 990_000_000n,
      targetAmountUnits: 1_000_000_000n,
      stopAtTarget: true,
    });
    assert.equal(r.cappedUnits, 10_000_000n);
    assert.equal(r.wasCapped, true);
  });

  it("payment requires payment + savings funds", () => {
    const payment = 100_000_000n;
    const save = calculateSaveAmountUnits(payment, "5.00");
    assert.equal(save, 5_000_000n);
    assert.throws(() =>
      assertSufficientBalance(100_000_000n, payment + save, "wallet"),
    );
  });
});
