/**
 * Pocket activity: only this pocket, Spend&Save never listed twice.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/save/__tests__/activity.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPocketActivity, countByGroup } from "@/lib/save/activity";

const tx = (overrides) => ({
  amount: "10",
  created_at: "2026-10-01T10:00:00.000Z",
  currency: "USDC",
  id: "t1",
  pocket_id: "rent",
  status: "COMPLETED",
  tx_hash: "0xabc",
  type: "DEPOSIT",
  ...overrides,
});

const event = (overrides) => ({
  created_at: "2026-10-02T10:00:00.000Z",
  currency: "USDC",
  failure_reason: null,
  id: "e1",
  payment_amount: "40",
  payment_tx_hash: "0xpay",
  pocket_id: "rent",
  save_amount: "2",
  save_percentage: "5",
  savings_transaction_id: null,
  status: "COMPLETED",
  ...overrides,
});

describe("buildPocketActivity", () => {
  it("keeps only the pocket's own rows", () => {
    const items = buildPocketActivity(
      "rent",
      [tx({}), tx({ id: "t2", pocket_id: "trip" })],
      [event({ id: "e2", pocket_id: "trip" })],
    );
    assert.deepEqual(items.map((item) => item.id), ["tx:t1"]);
  });

  it("enriches a Spend&Save ledger row with its payment and lists it once", () => {
    const items = buildPocketActivity(
      "rent",
      [tx({ amount: "2", id: "t3", type: "SPEND_SAVE" })],
      [event({ savings_transaction_id: "t3" })],
    );
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].spend, { paymentAmount: "40", paymentTxHash: "0xpay", savePercentage: 5 });
    assert.ok(items[0].transaction);
  });

  it("still lists a Spend&Save whose ledger row hasn't landed", () => {
    const items = buildPocketActivity("rent", [], [event({ status: "PENDING" })]);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, "spend_save");
    assert.equal(items[0].transaction, undefined);
  });

  it("knows which way money moved and sorts newest first", () => {
    const items = buildPocketActivity(
      "rent",
      [
        tx({}),
        tx({ created_at: "2026-10-03T10:00:00.000Z", id: "t2", type: "WITHDRAWAL" }),
        tx({ created_at: "2026-10-04T10:00:00.000Z", id: "t4", type: "REVERSAL" }),
      ],
      [],
    );
    assert.deepEqual(
      items.map((item) => [item.kind, item.direction]),
      [
        ["reversal", "out"],
        ["withdrawal", "out"],
        ["deposit", "in"],
      ],
    );
    assert.deepEqual(countByGroup(items), { ALL: 3, DEPOSIT: 1, SPEND_SAVE: 0, WITHDRAWAL: 1 });
  });
});
