import "@/lib/env-compat";
import {
  createWalletClient,
  isAddress,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createRecurringPublicClient } from "@/lib/recurring/circle-adapter";
import { erc20Abi } from "@/lib/contracts";
import { arcTokens, type ArcTokenSymbol } from "@/lib/tokens";
import { arcChain, arcTransport } from "@/lib/chains";

let workspaceEnvLoaded = false;
const loadedEnv: Record<string, string> = {};

async function ensureWorkspaceEnv() {
  if (workspaceEnvLoaded) {
    return;
  }
  workspaceEnvLoaded = true;
  try {
    const [{ config: loadEnv }, { existsSync }, { resolve }] = await Promise.all([
      import("dotenv"),
      import("node:fs"),
      import("node:path"),
    ]);
    for (const candidate of [
      resolve(process.cwd(), ".env"),
      resolve(process.cwd(), "../../.env"),
    ]) {
      if (existsSync(candidate)) {
        loadEnv({
          path: candidate,
          override: false,
          processEnv: loadedEnv,
          quiet: true,
        });
      }
    }
  } catch {
    // Use whatever process.env already contains.
  }
}

function envValue(name: string) {
  return (process.env[name] || loadedEnv[name] || "").trim();
}

function normalizePrivateKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
}

function treasuryPrivateKeys() {
  return [
    envValue("SAPHRA_CIRCLE_TREASURY_PRIVATE_KEY"),
    envValue("SAPHRA_RECURRING_OPERATOR_PRIVATE_KEY"),
    envValue("PRIVATE_KEY"),
    envValue("EVM_PRIVATE_KEY"),
  ]
    .map((value) => (value ? normalizePrivateKey(value) : null))
    .filter((value): value is `0x${string}` => Boolean(value));
}

function createTreasuryClients(treasury: Address) {
  const publicClient = createRecurringPublicClient();
  for (const privateKey of treasuryPrivateKeys()) {
    try {
      const account = privateKeyToAccount(privateKey);
      if (account.address.toLowerCase() !== treasury.toLowerCase()) {
        continue;
      }
      const walletClient = createWalletClient({
        account,
        chain: arcChain,
        transport: arcTransport(),
      });
      return { account, publicClient, walletClient };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Thin adapter over existing SaphraONE / Circle / Arc rails.
 * Circle (the SaphraONE feature) never calls raw Circle APIs from route handlers.
 */
export function circleTreasuryAddress(): Address | null {
  for (const value of [
    envValue("SAPHRA_CIRCLE_TREASURY_ADDRESS"),
    envValue("TREASURY_WALLET"),
    envValue("SAPHRA_RECURRING_OPERATOR_ADDRESS"),
    envValue("EVM_WALLET_ADDRESS"),
    envValue("WALLET_ADDRESS"),
  ]) {
    if (isAddress(value)) {
      return value as Address;
    }
  }
  return null;
}

export function isCircleTreasuryConfigured() {
  return Boolean(circleTreasuryAddress());
}

export async function getTreasuryTokenBalance(asset: ArcTokenSymbol) {
  const treasury = circleTreasuryAddress();
  if (!treasury) {
    return { balance: 0n, configured: false as const };
  }
  const token = arcTokens[asset];
  const client = createRecurringPublicClient();
  const balance = await client.readContract({
    abi: erc20Abi,
    address: token.address,
    args: [treasury],
    functionName: "balanceOf",
  });
  return { balance: balance as bigint, configured: true as const };
}

export async function getWalletTokenBalance(input: {
  wallet: Address;
  asset: ArcTokenSymbol;
}) {
  const token = arcTokens[input.asset];
  const client = createRecurringPublicClient();
  const balance = await client.readContract({
    abi: erc20Abi,
    address: token.address,
    args: [input.wallet],
    functionName: "balanceOf",
  });
  return balance as bigint;
}

/**
 * Direct ERC-20 send from the platform treasury EOA.
 * Do not use this for Circle Save. Pocket funds are in SwiftSaveVault;
 * withdrawals must call vault.withdraw, never this operator transfer.
 */
export async function submitTreasuryTransfer(input: {
  amountUnits: bigint;
  asset: ArcTokenSymbol;
  destination: Address;
}) {
  await ensureWorkspaceEnv();
  const treasury = circleTreasuryAddress();
  if (!treasury) {
    return {
      ok: false as const,
      error: "Circle treasury is not configured, so this withdrawal cannot be sent.",
    };
  }
  if (input.amountUnits <= 0n) {
    return {
      ok: false as const,
      error: "Withdrawal amount must be greater than zero.",
    };
  }
  const token = arcTokens[input.asset];
  if (!token?.address || !isAddress(token.address)) {
    return {
      ok: false as const,
      error: `Treasury cannot send ${input.asset} on Arc.`,
    };
  }
  const clients = createTreasuryClients(treasury);
  if (!clients) {
    return {
      ok: false as const,
      error:
        "Circle treasury cannot send this withdrawal yet. The operator wallet does not match the treasury.",
    };
  }

  try {
    const { request } = await clients.publicClient.simulateContract({
      account: clients.account,
      abi: erc20Abi,
      address: token.address,
      args: [input.destination, input.amountUnits],
      functionName: "transfer",
    });
    const hash = await clients.walletClient.writeContract(request);
    return { ok: true as const, txHash: hash as Hash };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Treasury transfer failed.";
    return { ok: false as const, error: message };
  }
}

export type CircleTransactionProposal = {
  kind: "personal_send" | "treasury_withdraw";
  circleId: string;
  asset: ArcTokenSymbol;
  totalAmountUnits: string;
  destinations: Array<{ wallet: string; amountUnits: string }>;
  treasuryAddress: string | null;
};
