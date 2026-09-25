/**
 * Invoice payments are credited from the chain, not the payer's browser.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/account/__tests__/verify-invoice-payment.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";

import { receivedAmount } from "@/lib/account/verify-invoice-payment";

const abi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const usdc = { address: "0x3600000000000000000000000000000000000000", decimals: 6 };
const eurc = "0x89b50855aa3be2f677cd6303cec089b5f319d72a";
const business = "0x1111111111111111111111111111111111111111";
const payer = "0x2222222222222222222222222222222222222222";
const router = "0x3333333333333333333333333333333333333333";

function transfer(token, from, to, units) {
  return {
    address: token,
    topics: encodeEventTopics({ abi, eventName: "Transfer", args: { from, to } }),
    data: encodeAbiParameters([{ type: "uint256" }], [units]),
  };
}

describe("receivedAmount", () => {
  it("credits what reached the business wallet", () => {
    const logs = [transfer(usdc.address, payer, business, 500_000_000n)];
    assert.equal(receivedAmount({ logs, token: usdc, destination: business }), 500);
  });

  it("adds up a payment routed through the send router", () => {
    const logs = [
      transfer(usdc.address, payer, router, 500_500_000n),
      transfer(usdc.address, router, business, 500_000_000n),
      transfer(usdc.address, router, "0x4444444444444444444444444444444444444444", 500_000n),
    ];
    assert.equal(receivedAmount({ logs, token: usdc, destination: business }), 500);
  });

  it("credits nothing sent elsewhere, in another token, or not at all", () => {
    assert.equal(
      receivedAmount({ logs: [transfer(usdc.address, payer, router, 5_000_000n)], token: usdc, destination: business }),
      null,
    );
    assert.equal(
      receivedAmount({ logs: [transfer(eurc, payer, business, 5_000_000n)], token: usdc, destination: business }),
      null,
    );
    assert.equal(receivedAmount({ logs: [], token: usdc, destination: business }), null);
  });

  it("ignores the business moving its own money", () => {
    const logs = [transfer(usdc.address, business, business, 9_000_000n)];
    assert.equal(receivedAmount({ logs, token: usdc, destination: business }), null);
  });
});
