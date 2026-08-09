import type { Abi, Address } from "viem";

/**
 * @deprecated Legacy merchant treasury stub ABI (apps/web/abi.json).
 * Earn uses `lib/earn/*` — ERC-4626 SwiftPayVault + Aave strategy.
 */
import legacyTreasuryAbiJson from "@/abi.json";

/** @deprecated Use earnConfig.vaultAddress from @/lib/earn/config */
export const swiftPayVaultAddress = (process.env
  .NEXT_PUBLIC_EARN_VAULT_ADDRESS?.trim() ||
  "0x0000000000000000000000000000000000000000") as Address;

/** @deprecated Prefer swiftPayVaultAbi from @/lib/earn/abis */
export const swiftPayVaultAbi = legacyTreasuryAbiJson as Abi;

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

/** Platform fee for PrivSwiftPay escrow deposits: 1% = 100 bps. */
export const privacyEscrowFeeBasisPoints = 100;

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
] as const;

export const swiftBatchAddress =
  process.env.NEXT_PUBLIC_SWIFTBATCH_ADDRESS?.trim() ?? "";

export const swiftBatchFeeRecipient =
  process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT?.trim() ?? "";

/** Platform fee for SwiftBatch and SwiftRecurepay: 1% = 100 bps. */
export const swiftBatchFeeBasisPoints = 100;

/** Same 1% platform fee for recurring (SwiftRecurepay) payments. */
export const recurringPlatformFeeBasisPoints = 100;

export const swiftBatchMaxRecipients = 500;

export const swiftRecurepayExecutorAddress =
  process.env.NEXT_PUBLIC_SWIFTRECUREPAY_EXECUTOR_ADDRESS?.trim() ?? "";

export const swiftRecurepayExecutorAbi = [
  {
    type: "function",
    name: "operator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "executeRecurringPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "executionId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "payer", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "consumedExecutionIds",
    stateMutability: "view",
    inputs: [{ name: "executionId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

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
