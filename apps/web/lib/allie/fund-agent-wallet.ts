"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  type Address,
  type Chain,
  type Hash,
} from "viem";

import { onchainFacts } from "@/lib/onchain-facts";

import { prepareFunding, type WalletContext } from "@/lib/allie/client";
import { arcTokens } from "@/lib/tokens";

/**
 * Move USDC from the user's primary wallet into the Agent Wallet.
 *
 * The transfer is signed in the browser — SwiftPay never holds those keys, so
 * the server can only validate the request and hand back the exact transfer to
 * sign. Same signing path as every other SwiftPay payment.
 */
export async function fundAgentWalletOnchain(
  input: WalletContext & {
    amountUsdc: string;
    asset?: "USDC" | "EURC";
    fromAddress: string;
    resolveProvider: () => Promise<unknown>;
  },
): Promise<{ txHash: string; amountDisplay: string; asset: string }> {
  const { funding } = await prepareFunding({
    amountUsdc: input.amountUsdc,
    asset: input.asset,
    circleSocialUuid: input.circleSocialUuid,
    fromAddress: input.fromAddress,
    ownerWallet: input.ownerWallet,
  });

  if (!isAddress(funding.agentWalletAddress) || !isAddress(funding.token)) {
    throw new Error("The agent wallet address is not configured correctly.");
  }

  const provider = await input.resolveProvider();

  const walletClient = createWalletClient({
    account: getAddress(input.fromAddress),
    chain: onchainFacts.chain as Chain,
    transport: custom(
      provider as { request: (args: unknown) => Promise<unknown> },
    ),
  });

  const txHash = await walletClient.sendTransaction({
    data: encodeFunctionData({
      abi: erc20Abi,
      args: [
        getAddress(funding.agentWalletAddress) as Address,
        BigInt(funding.amountUnits),
      ],
      functionName: "transfer",
    }),
    to: getAddress(funding.token) as Address,
  });

  return {
    amountDisplay: funding.amountDisplay,
    asset: funding.asset,
    txHash,
  };
}

/**
 * Pay the ALLIE Pro monthly fee from the user's primary wallet.
 * Same signing path as funding — the browser signs, the server records.
 */
export async function payAllieProFee(input: {
  feeRecipient: string;
  fromAddress: string;
  monthlyFeeUsdc: number;
  resolveProvider: () => Promise<unknown>;
}): Promise<string> {
  if (!isAddress(input.feeRecipient)) {
    throw new Error("The ALLIE Pro fee recipient is not configured.");
  }

  const token = arcTokens.USDC.address;

  if (!isAddress(token)) {
    throw new Error("USDC is not configured for this network.");
  }

  // 6-decimal units, built from a fixed string so the float never reaches the
  // amount that gets signed.
  const [whole, fraction = ""] = input.monthlyFeeUsdc.toFixed(6).split(".");
  const amountUnits = BigInt(whole + fraction.padEnd(6, "0").slice(0, 6));

  if (amountUnits <= 0n) {
    throw new Error("The ALLIE Pro price is not configured.");
  }

  const provider = await input.resolveProvider();

  const walletClient = createWalletClient({
    account: getAddress(input.fromAddress),
    chain: onchainFacts.chain as Chain,
    transport: custom(
      provider as { request: (args: unknown) => Promise<unknown> },
    ),
  });

  const hash = await walletClient.sendTransaction({
    data: encodeFunctionData({
      abi: erc20Abi,
      args: [getAddress(input.feeRecipient) as Address, amountUnits],
      functionName: "transfer",
    }),
    to: getAddress(token) as Address,
  });

  // Remember the payment before anything else can fail, so a retry activates
  // with it instead of charging again.
  rememberPendingProPayment(input.fromAddress, hash);

  // sendTransaction resolves on broadcast; the server can only verify a
  // payment that is already in a block.
  const receipt = await createPublicClient({
    chain: onchainFacts.chain as Chain,
    transport: http(onchainFacts.rpcUrl),
  }).waitForTransactionReceipt({ hash, timeout: 90_000 });

  if (receipt.status !== "success") {
    forgetPendingProPayment(input.fromAddress);
    throw new Error("The Pro payment failed on-chain. No USDC was taken; try again.");
  }

  return hash;
}

/** Matches the server's window for activating Pro with a payment. */
const pendingProPaymentMaxAgeMs = 2 * 60 * 60 * 1000;
const pendingProPaymentKey = (wallet: string) =>
  `swiftpay:allie-pro-payment:${wallet.toLowerCase()}`;

/**
 * A Pro fee payment that was sent but has not activated Pro yet, if it is
 * recent enough to still activate. Browser-local: it only exists to save a
 * second charge after a failed activation on this device.
 */
export function readPendingProPayment(wallet: string): Hash | null {
  try {
    const raw = localStorage.getItem(pendingProPaymentKey(wallet));
    if (!raw) return null;
    const { hash, sentAt } = JSON.parse(raw) as { hash?: string; sentAt?: number };
    if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
    if (!sentAt || Date.now() - sentAt > pendingProPaymentMaxAgeMs) {
      forgetPendingProPayment(wallet);
      return null;
    }
    return hash as Hash;
  } catch {
    return null;
  }
}

function rememberPendingProPayment(wallet: string, hash: Hash) {
  try {
    localStorage.setItem(
      pendingProPaymentKey(wallet),
      JSON.stringify({ hash, sentAt: Date.now() }),
    );
  } catch {
    // Storage unavailable: a failed activation would need a new payment.
  }
}

export function forgetPendingProPayment(wallet: string) {
  try {
    localStorage.removeItem(pendingProPaymentKey(wallet));
  } catch {
    // Nothing to clear.
  }
}
