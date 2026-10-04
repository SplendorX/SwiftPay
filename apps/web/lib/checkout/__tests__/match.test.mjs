/**
 * Hash-less matching of card/bank and bridge payments to charges.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/checkout/__tests__/match.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MATCH_GRACE_BLOCKS, matchTarget, selectMatches } from "@/lib/checkout/match";

const head = 10_000;
const old = head - MATCH_GRACE_BLOCKS - 10;

function charge(id, overrides = {}) {
  return {
    amount: "5",
    amount_received: "0",
    created_at: "2026-10-04T10:00:00.000Z",
    created_block: 1_000,
    currency: "USDC",
    id,
    pending_started_at: "2026-10-04T10:00:00.000Z",
    reported_amount: null,
    tip_amount: "0",
    ...overrides,
  };
}

function transfer(hash, amount, overrides = {}) {
  return {
    amount,
    blockNumber: old,
    from: "0x9999999999999999999999999999999999999999",
    hash,
    symbol: "USDC",
    ...overrides,
  };
}

function run(transfers, charges, extra = {}) {
  return selectMatches({
    charges,
    claimedHashes: new Set(),
    excludedSenders: new Set(),
    headBlock: head,
    transfers,
    ...extra,
  }).map((match) => [match.transfer.hash, match.chargeId]);
}

describe("selectMatches", () => {
  it("matches within the tolerance of amount plus tip", () => {
    assert.deepEqual(run([transfer("0xa", "5.96")], [charge("c1", { tip_amount: "1" })]), [["0xa", "c1"]]);
    // 1% of 6 is 0.06; 5.93 is 0.07 off.
    assert.deepEqual(run([transfer("0xa", "5.93")], [charge("c1", { tip_amount: "1" })]), []);
  });

  it("allows at least 0.05 on small charges", () => {
    assert.deepEqual(run([transfer("0xa", "0.95")], [charge("c1", { amount: "1" })]), [["0xa", "c1"]]);
    assert.deepEqual(run([transfer("0xa", "0.94")], [charge("c1", { amount: "1" })]), []);
  });

  it("ignores transfers mined before the charge was created", () => {
    assert.deepEqual(run([transfer("0xa", "5", { blockNumber: 999 })], [charge("c1")]), []);
  });

  it("ignores charges without a creation block", () => {
    assert.deepEqual(run([transfer("0xa", "5")], [charge("c1", { created_block: null })]), []);
  });

  it("waits out the grace window so receipt confirms win", () => {
    const fresh = transfer("0xa", "5", { blockNumber: head - MATCH_GRACE_BLOCKS + 1 });
    assert.deepEqual(run([fresh], [charge("c1")]), []);
  });

  it("skips claimed hashes and direct payers", () => {
    assert.deepEqual(run([transfer("0xa", "5")], [charge("c1")], { claimedHashes: new Set(["0xa"]) }), []);
    const payer = "0x1234567890123456789012345678901234567890";
    assert.deepEqual(
      run([transfer("0xa", "5", { from: payer })], [charge("c1")], {
        excludedSenders: new Set([payer]),
      }),
      [],
    );
  });

  it("only matches the same currency", () => {
    assert.deepEqual(run([transfer("0xa", "5", { symbol: "EURC" })], [charge("c1")]), []);
  });

  it("prefers the closest amount, then the oldest intent", () => {
    const charges = [
      charge("c5", { amount: "5" }),
      charge("c502", { amount: "5.02" }),
    ];
    assert.deepEqual(run([transfer("0xa", "5.02")], charges), [["0xa", "c502"]]);

    const twins = [
      charge("newer", { pending_started_at: "2026-10-04T10:05:00.000Z" }),
      charge("older", { pending_started_at: "2026-10-04T10:01:00.000Z" }),
    ];
    assert.deepEqual(run([transfer("0xa", "5")], twins), [["0xa", "older"]]);
  });

  it("pairs one to one, oldest transfer first", () => {
    const charges = [
      charge("first", { pending_started_at: "2026-10-04T10:01:00.000Z" }),
      charge("second", { pending_started_at: "2026-10-04T10:02:00.000Z" }),
    ];
    const transfers = [
      transfer("0xlate", "5", { blockNumber: old }),
      transfer("0xearly", "5", { blockNumber: old - 5 }),
      transfer("0xextra", "5", { blockNumber: old - 1 }),
    ];
    assert.deepEqual(run(transfers, charges), [
      ["0xearly", "first"],
      ["0xextra", "second"],
    ]);
  });

  it("uses the amount the widget reported when there is one", () => {
    const reported = charge("c1", { reported_amount: "4.80" });
    assert.equal(matchTarget(reported), 4.8);
    assert.deepEqual(run([transfer("0xa", "4.8")], [reported]), [["0xa", "c1"]]);
    assert.deepEqual(run([transfer("0xa", "5")], [reported]), []);
  });

  it("targets what is left on a partly paid charge", () => {
    const partial = charge("c1", { amount_received: "3" });
    assert.equal(matchTarget(partial), 2);
    assert.deepEqual(run([transfer("0xa", "2")], [partial]), [["0xa", "c1"]]);
  });
});
