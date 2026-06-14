import type { Abi, Address } from "viem";

import swiftPayVaultAbiJson from "@/abi.json";

export const swiftPayVaultAddress =
  "0xb854303ea392cafceda9d0f4c2c48c0af9560281" as const satisfies Address;

export const swiftPayVaultAbi = swiftPayVaultAbiJson as Abi;

export const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export const privacyEscrowAddress =
  process.env.NEXT_PUBLIC_PRIVSWIFTPAY_ESCROW_ADDRESS?.trim() ?? "";

export const privacyEscrowAbi = [
  {
    type: "function",
    name: "depositPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositPayments",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentIds", type: "bytes32[]" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "commitments", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "bytes32" },
      { name: "secret", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "payments",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "bytes32" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "claimed", type: "bool" },
    ],
  },
] as const;

export const swiftBatchAddress =
  process.env.NEXT_PUBLIC_SWIFTBATCH_ADDRESS?.trim() ?? "";

export const swiftBatchFeeRecipient =
  process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT?.trim() ?? "";

export const swiftBatchFeeBasisPoints = 10;

export const swiftBatchMaxRecipients = 500;

export const swiftBatchAbi = [
  {
    type: "function",
    name: "sendBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "feeRecipient",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "PLATFORM_FEE_BASIS_POINTS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_RECIPIENTS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
