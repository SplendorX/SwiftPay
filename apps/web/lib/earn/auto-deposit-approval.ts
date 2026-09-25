"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  getAddress,
  http,
  parseUnits,
  type Address,
  type Chain,
} from "viem";

import { erc20Abi } from "@/lib/contracts";
import { onchainFacts } from "@/lib/onchain-facts";

/**
 * Unattended deposits pull USDC through the vault's executor, so the owner
 * approves it once. The allowance covers a fixed number of runs rather than
 * an unlimited amount: when it runs out, runs are skipped with a reason and
 * the owner approves again.
 */
export const APPROVED_RUNS = 12;

export function autoDepositAllowanceUsdc(amountUsdc: number) {
  return amountUsdc * APPROVED_RUNS;
}

/** Approve `executor` for APPROVED_RUNS deposits, unless it already is. */
export async function approveAutoDeposit(input: {
  amountUsdc: number;
  executor: string;
  resolveProvider: () => Promise<unknown>;
  walletAddress: string;
}) {
  const usdc = onchainFacts.usdcAddress;
  if (!usdc) throw new Error("USDC is not configured for this network.");

  const owner = getAddress(input.walletAddress);
  const executor = getAddress(input.executor) as Address;
  const wanted = parseUnits(autoDepositAllowanceUsdc(input.amountUsdc).toFixed(6), 6);

  const publicClient = createPublicClient({
    chain: onchainFacts.chain as Chain,
    transport: http(onchainFacts.rpcUrl),
  });
  const current = (await publicClient.readContract({
    abi: erc20Abi,
    address: usdc,
    args: [owner, executor],
    functionName: "allowance",
  })) as bigint;
  if (current >= wanted) return null;

  const provider = await input.resolveProvider();
  const walletClient = createWalletClient({
    account: owner,
    chain: onchainFacts.chain as Chain,
    transport: custom(provider as { request: (args: unknown) => Promise<unknown> }),
  });

  const hash = await walletClient.sendTransaction({
    data: encodeFunctionData({
      abi: erc20Abi,
      args: [executor, wanted],
      functionName: "approve",
    }),
    to: usdc,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
