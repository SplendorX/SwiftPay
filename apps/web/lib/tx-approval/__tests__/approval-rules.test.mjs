/**
 * Transaction approvals — the server only lets a Circle call through when it
 * fits what the user approved: the exact call, or for a send, the approved
 * recipient and amount.
 *
 * Run: pnpm --filter @saphra/web test:tx-approval
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encodeFunctionData, erc20Abi, parseUnits, zeroAddress, zeroHash } from "viem";

const router = "0x1111111111111111111111111111111111111111";
process.env.NEXT_PUBLIC_SWIFTPAY_SEND_ADDRESS = router;

const { swiftPaySendAbi } = await import("@/lib/contracts");
const { arcTokens } = await import("@/lib/tokens");
const { decodeCall, hashCall, usdValue } = await import("@/lib/tx-approval/decode");
const { callFitsApproval } = await import("@/lib/tx-approval/server");

const usdc = arcTokens.USDC.address;
const friend = "0x2222222222222222222222222222222222222222";
const stranger = "0x3333333333333333333333333333333333333333";
const swapContract = "0x4444444444444444444444444444444444444444";

function routerSend(recipient, amount) {
  return {
    action: "createContractExecution",
    callData: encodeFunctionData({
      abi: swiftPaySendAbi,
      functionName: "send",
      args: [usdc, recipient, parseUnits(amount, 6), zeroAddress, zeroHash, 0n],
    }),
    contractAddress: router,
    walletId: "wallet-1",
  };
}

function approveCall(spender) {
  return {
    action: "createContractExecution",
    callData: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, 2n ** 256n - 1n],
    }),
    contractAddress: usdc,
    walletId: "wallet-1",
  };
}

function row(overrides = {}) {
  return {
    amount: 25,
    call_hashes: [],
    destination: friend,
    kind: "send",
    token: "USDC",
    ...overrides,
  };
}

describe("decodeCall", () => {
  it("reads the recipient and amount of a SaphraONE send", () => {
    const decoded = decodeCall(routerSend(friend, "25"));
    assert.equal(decoded.type, "pay");
    assert.equal(decoded.destination, friend);
    assert.equal(decoded.amount, 25);
    assert.equal(decoded.token, "USDC");
  });

  it("reads an ERC-20 transfer", () => {
    const decoded = decodeCall({
      action: "createContractExecution",
      callData: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [stranger, parseUnits("1500", 6)],
      }),
      contractAddress: usdc,
      walletId: "wallet-1",
    });
    assert.equal(decoded.type, "pay");
    assert.equal(decoded.destination, stranger);
    assert.equal(decoded.amount, 1500);
  });

  it("reads a Circle transfer", () => {
    const decoded = decodeCall({
      action: "createTransfer",
      amount: "10",
      destinationAddress: friend.toUpperCase().replace("0X", "0x"),
      tokenAddress: usdc,
      walletId: "wallet-1",
    });
    assert.equal(decoded.type, "pay");
    assert.equal(decoded.destination, friend);
    assert.equal(decoded.amount, 10);
  });

  it("prices EURC above its usual rate, never below", () => {
    assert.ok(usdValue(1000, "EURC") > 1000);
    assert.equal(usdValue(1000, "USDC"), 1000);
  });
});

describe("hashCall", () => {
  it("is the same for the same call and differs when anything changes", () => {
    assert.equal(hashCall(routerSend(friend, "25")), hashCall(routerSend(friend, "25")));
    assert.notEqual(hashCall(routerSend(friend, "25")), hashCall(routerSend(stranger, "25")));
    assert.notEqual(hashCall(routerSend(friend, "25")), hashCall(routerSend(friend, "26")));
  });
});

describe("callFitsApproval", () => {
  it("lets an approved send through, and its router approval", () => {
    assert.equal(callFitsApproval(row(), routerSend(friend, "25")), null);
    assert.equal(callFitsApproval(row(), routerSend(friend, "10")), null);
    assert.equal(callFitsApproval(row(), approveCall(router)), null);
  });

  it("refuses a send to someone else", () => {
    assert.match(callFitsApproval(row(), routerSend(stranger, "25")), /recipient/);
  });

  it("refuses a send for more than was approved", () => {
    assert.match(callFitsApproval(row(), routerSend(friend, "25.01")), /amount/);
  });

  it("refuses letting any other contract spend the money", () => {
    assert.match(callFitsApproval(row(), approveCall(stranger)), /approval/);
  });

  it("refuses unrelated calls under a send approval", () => {
    const other = { action: "createContractExecution", callData: "0xdeadbeef", contractAddress: swapContract, walletId: "wallet-1" };
    assert.ok(callFitsApproval(row(), other));
    assert.ok(callFitsApproval(row(), { action: "signTypedData", data: "{}", walletId: "wallet-1" }));
  });

  it("never lets a swap approval pay anyone", () => {
    const swap = row({ destination: null, kind: "swap" });
    assert.match(callFitsApproval(swap, routerSend(stranger, "1")), /swap/);
    const swapCall = { action: "createContractExecution", callData: "0xdeadbeef", contractAddress: swapContract, walletId: "wallet-1" };
    assert.equal(callFitsApproval(swap, swapCall), null);
  });

  it("holds a one-call approval to that exact call", () => {
    const call = routerSend(friend, "5");
    const single = row({ call_hashes: [hashCall(call)], kind: "call" });
    assert.equal(callFitsApproval(single, call), null);
    assert.ok(callFitsApproval(single, routerSend(friend, "6")));
  });
});
