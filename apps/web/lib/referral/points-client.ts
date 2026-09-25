"use client";

import {
  createWalletClient,
  custom,
  encodeFunctionData,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
  type Chain,
} from "viem";

import { erc20Abi } from "@/lib/contracts";
import { onchainFacts } from "@/lib/onchain-facts";

/**
 * Client side of the SwiftPoints economy.
 *
 * Buying points is a real USDC transfer to the treasury followed by a server
 * call that verifies it on chain. The transfer is sent through whichever
 * provider the session has — an injected wallet, or the Circle EIP-1193 shim —
 * so Google and external users take exactly the same path.
 */

export type PointsPurchaseConfig = {
  pointsPerUsdc: number;
  treasuryAddress: string | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.message || "SwiftPoints request failed.");
  }

  return payload as T;
}

export async function fetchPurchaseConfig(input: {
  circleSocialUuid?: string;
  walletAddress: string;
}): Promise<PointsPurchaseConfig> {
  const params = new URLSearchParams({ wallet: input.walletAddress });
  if (input.circleSocialUuid) {
    params.set("circleSocialUuid", input.circleSocialUuid);
  }

  return readJson<PointsPurchaseConfig>(
    await fetch(`/api/swiftpoints/purchase?${params.toString()}`, {
      cache: "no-store",
    }),
  );
}

/**
 * Pay the treasury, then ask the server to credit the points.
 *
 * The two halves are deliberately separate: the payment is irreversible once
 * signed, so if crediting fails the hash is returned with the error and the
 * same hash can be submitted again — the server keys on it and will not double
 * credit.
 */
/**
 * The payment landed but crediting it did not.
 *
 * Worth its own type: every other failure here happens before any money moves,
 * so the caller can offer a retry. After this one it must not, because a retry
 * would send a second payment.
 */
export class SwiftPointsCreditError extends Error {
  readonly txHash: string;

  constructor(message: string, txHash: string) {
    super(message);
    this.name = "SwiftPointsCreditError";
    this.txHash = txHash;
  }
}

export async function buySwiftPoints(input: {
  circleSocialUuid?: string;
  resolveProvider: () => Promise<unknown>;
  treasuryAddress: string;
  usdcAmount: string;
  walletAddress: string;
}): Promise<{ points: number; txHash: string }> {
  if (!isAddress(input.treasuryAddress)) {
    throw new Error("The SwiftPoints treasury address is not configured.");
  }

  const usdc = onchainFacts.usdcAddress;
  if (!usdc) {
    throw new Error("USDC is not configured for this network.");
  }

  const amountUnits = parseUnits(input.usdcAmount, 6);
  if (amountUnits <= BigInt(0)) {
    throw new Error("Enter an amount greater than zero.");
  }

  const provider = await input.resolveProvider();
  const walletClient = createWalletClient({
    account: getAddress(input.walletAddress),
    chain: onchainFacts.chain as Chain,
    transport: custom(provider as { request: (args: unknown) => Promise<unknown> }),
  });

  let txHash: `0x${string}`;
  try {
    txHash = await walletClient.sendTransaction({
      data: encodeFunctionData({
        abi: erc20Abi,
        args: [getAddress(input.treasuryAddress) as Address, amountUnits],
        functionName: "transfer",
      }),
      to: usdc,
    });
  } catch (cause) {
    // The Circle wallet gives up waiting for the hash while the transfer is
    // still confirming. The money is on its way, so this must not read as a
    // failed attempt the user can simply retry.
    const message = cause instanceof Error ? cause.message : "";
    if (/submitted and is still confirming/i.test(message)) {
      throw new SwiftPointsCreditError(
        `Your ${input.usdcAmount} USDC payment was submitted but is still confirming, so the points could not be credited yet. Do not pay again — contact support with your wallet address and it will be credited once.`,
        "",
      );
    }
    throw cause;
  }

  try {
    const result = await readJson<{ purchase: { points: number } }>(
      await fetch("/api/swiftpoints/purchase", {
        body: JSON.stringify({
          circleSocialUuid: input.circleSocialUuid,
          txHash,
          walletAddress: input.walletAddress,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    return { points: result.purchase.points, txHash };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Crediting failed.";
    throw new SwiftPointsCreditError(
      `${message} Your ${input.usdcAmount} USDC payment went through (${txHash.slice(0, 10)}…) but the points were not credited yet. Do not pay again — quote this transaction to support and it will be credited once.`,
      txHash,
    );
  }
}

export async function giftSwiftPointsRequest(input: {
  circleSocialUuid?: string;
  note?: string;
  points: number;
  recipientWallet: string;
  walletAddress: string;
}) {
  return readJson<{ gift: { id: string; points: number } }>(
    await fetch("/api/swiftpoints/gift", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}
