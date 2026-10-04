/**
 * Charge payments are credited from the chain, counting an Arc USDC send once
 * even though it emits both an ERC-20 and a native Transfer event.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/checkout/__tests__/verify.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";

import { NATIVE_USDC_EVENT_ADDRESS } from "@/lib/arc-transfers";
import { receivedChargeAmount } from "@/lib/checkout/verify";
import { arcTokens } from "@/lib/tokens";

const abi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const usdc = arcTokens.USDC.address;
const business = "0x1111111111111111111111111111111111111111";
const payer = "0x2222222222222222222222222222222222222222";
const elsewhere = "0x4444444444444444444444444444444444444444";

function transfer(token, from, to, units) {
  return {
    address: token,
    topics: encodeEventTopics({ abi, eventName: "Transfer", args: { from, to } }),
    data: encodeAbiParameters([{ type: "uint256" }], [units]),
  };
}

describe("receivedChargeAmount", () => {
  it("credits an ERC-20 USDC transfer to the business", () => {
    const logs = [transfer(usdc, payer, business, 6_000_000n)];
    assert.deepEqual(receivedChargeAmount({ logs, currency: "USDC", destination: business }), {
      amount: 6,
      from: payer,
    });
  });

  it("credits a native USDC send (18 decimals) when there is no ERC-20 event", () => {
    const logs = [transfer(NATIVE_USDC_EVENT_ADDRESS, payer, business, 6n * 10n ** 18n)];
    assert.deepEqual(receivedChargeAmount({ logs, currency: "USDC", destination: business }), {
      amount: 6,
      from: payer,
    });
  });

  it("counts an ERC-20 send that also emits the native event once", () => {
    const logs = [
      transfer(usdc, payer, business, 6_000_000n),
      transfer(NATIVE_USDC_EVENT_ADDRESS, payer, business, 6n * 10n ** 18n),
    ];
    assert.equal(receivedChargeAmount({ logs, currency: "USDC", destination: business })?.amount, 6);
  });

  it("credits nothing sent to another wallet", () => {
    const logs = [
      transfer(usdc, payer, elsewhere, 6_000_000n),
      transfer(NATIVE_USDC_EVENT_ADDRESS, payer, elsewhere, 6n * 10n ** 18n),
    ];
    assert.equal(receivedChargeAmount({ logs, currency: "USDC", destination: business }), null);
  });

  it("never credits native USDC events to an EURC charge", () => {
    const logs = [transfer(NATIVE_USDC_EVENT_ADDRESS, payer, business, 6n * 10n ** 18n)];
    assert.equal(receivedChargeAmount({ logs, currency: "EURC", destination: business }), null);
  });
});
