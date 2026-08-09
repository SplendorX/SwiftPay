import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, encodePacked } from "viem";

import { earnConfig } from "@/lib/earn/config";
import { formatUnitsToDecimal, parseDecimalToUnits } from "@/lib/earn/decimal";
import { erc20Abi } from "@/lib/contracts";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { arcTestnetTokens } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

const rulesTable =
  process.env.SUPABASE_EARN_AUTO_SAVE_RULES_TABLE ?? "earn_auto_save_rules";
const executionsTable =
  process.env.SUPABASE_EARN_AUTO_SAVE_EXECUTIONS_TABLE ??
  "earn_auto_save_executions";

export type AutoSaveFrequency = "daily" | "weekly" | "monthly";

export type AutoSaveRule = {
  id: string;
  owner_wallet: string;
  enabled: boolean;
  min_idle_balance: string;
  save_amount: string;
  frequency: AutoSaveFrequency;
  auto_sweep_enabled: boolean;
  auto_sweep_keep_balance: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_skip_reason: string | null;
  authorization_accepted: boolean;
  authorization_note: string | null;
  usdc_allowance_to: string | null;
  created_at: string;
  updated_at: string;
};

export const earnAutoSaveExecutorAbi = [
  {
    type: "function",
    name: "executeAutoSave",
    stateMutability: "nonpayable",
    inputs: [
      { name: "executionId", type: "bytes32" },
      { name: "user", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "operator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "consumedExecutionIds",
    stateMutability: "view",
    inputs: [{ name: "executionId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function earnAutoSaveExecutorAddress(): Address | null {
  const value = process.env.NEXT_PUBLIC_EARN_AUTOSAVE_EXECUTOR_ADDRESS?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value as Address;
}

export const AUTO_SAVE_AUTHORIZATION_TEXT =
  "You authorize SwiftPay to move USDC into Earn according to your Auto-Save settings, only when your available balance stays at or above your minimum. SwiftPay never takes performance fees on principal.";

function getOperatorPrivateKey() {
  return (
    process.env.SWIFTPAY_EARN_OPERATOR_PRIVATE_KEY?.trim() ||
    process.env.SWIFTPAY_RECURRING_OPERATOR_PRIVATE_KEY?.trim() ||
    process.env.PRIVATE_KEY?.trim() ||
    null
  );
}

export function isAutoSaveOperatorConfigured() {
  return Boolean(earnAutoSaveExecutorAddress() && getOperatorPrivateKey());
}

export function nextRunAtFromFrequency(
  frequency: AutoSaveFrequency,
  from = new Date(),
): Date {
  const next = new Date(from);
  if (frequency === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

export function buildAutoSaveExecutionId(parts: {
  ruleId: string;
  ownerWallet: string;
  dueAt: string;
  amountUnits: string;
}): Hash {
  return keccak256(
    encodePacked(
      ["string", "address", "string", "string"],
      [
        parts.ruleId,
        parts.ownerWallet as Address,
        parts.dueAt,
        parts.amountUnits,
      ],
    ),
  );
}

function createClients() {
  const key = getOperatorPrivateKey();
  if (!key) return null;

  const account = privateKeyToAccount(key as `0x${string}`);
  const transport = http(arcTestnet.rpcUrls.default.http[0]);
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport,
  });
  return { account, publicClient, walletClient };
}

/**
 * Evaluate due Auto-Save rules.
 * Never drains below min_idle_balance.
 * When operator + executor are configured, executes on-chain via allowance.
 * Otherwise creates awaiting_wallet executions for the user to confirm in UI.
 */
export async function processDueAutoSaveRules(): Promise<{
  scannedCount: number;
  executedCount: number;
  skippedCount: number;
  pendingCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let scannedCount = 0;
  let executedCount = 0;
  let skippedCount = 0;
  let pendingCount = 0;

  if (earnConfig.mode === "unavailable" || !earnConfig.vaultAddress) {
    return {
      scannedCount: 0,
      executedCount: 0,
      skippedCount: 0,
      pendingCount: 0,
      errors: [],
    };
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return {
      scannedCount: 0,
      executedCount: 0,
      skippedCount: 0,
      pendingCount: 0,
      errors: [
        error instanceof Error ? error.message : "Supabase unavailable.",
      ],
    };
  }

  const nowIso = new Date().toISOString();
  const { data: rules, error } = await supabase
    .from(rulesTable)
    .select("*")
    .eq("enabled", true)
    .eq("authorization_accepted", true)
    .lte("next_run_at", nowIso)
    .limit(100);

  if (error) {
    return {
      scannedCount: 0,
      executedCount: 0,
      skippedCount: 0,
      pendingCount: 0,
      errors: [error.message],
    };
  }

  const list = (rules ?? []) as AutoSaveRule[];
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });
  const usdc = arcTestnetTokens.USDC.address;
  const decimals = arcTestnetTokens.USDC.decimals;
  const operatorReady = isAutoSaveOperatorConfigured();
  const executor = earnAutoSaveExecutorAddress();
  const clients = operatorReady ? createClients() : null;

  for (const rule of list) {
    scannedCount += 1;
    try {
      const minUnits = parseDecimalToUnits(rule.min_idle_balance, decimals);
      const saveUnits = parseDecimalToUnits(rule.save_amount, decimals);
      const keepUnits = rule.auto_sweep_enabled
        ? parseDecimalToUnits(rule.auto_sweep_keep_balance || "0", decimals)
        : minUnits;

      const balance = (await publicClient.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [rule.owner_wallet as Address],
      })) as bigint;

      let amountToSave = saveUnits;

      if (rule.auto_sweep_enabled && balance > keepUnits) {
        const excess = balance - keepUnits;
        if (excess > amountToSave) {
          amountToSave = excess;
        }
      }

      // Safety: never leave balance below minimum after save
      if (balance < minUnits + amountToSave) {
        const skipReason =
          "Auto-save skipped — available balance below your minimum.";
        await supabase
          .from(rulesTable)
          .update({
            last_skip_reason: skipReason,
            next_run_at: nextRunAtFromFrequency(rule.frequency).toISOString(),
            updated_at: nowIso,
          })
          .eq("id", rule.id);

        await supabase.from(executionsTable).insert({
          rule_id: rule.id,
          owner_wallet: rule.owner_wallet,
          amount: formatUnitsToDecimal(amountToSave, decimals),
          amount_units: amountToSave.toString(),
          status: "skipped",
          skip_reason: skipReason,
          due_at: nowIso,
          completed_at: nowIso,
        });

        skippedCount += 1;
        continue;
      }

      const executionId = buildAutoSaveExecutionId({
        ruleId: rule.id,
        ownerWallet: rule.owner_wallet,
        dueAt: nowIso,
        amountUnits: amountToSave.toString(),
      });

      if (operatorReady && clients && executor) {
        // Check allowance to executor
        const allowance = (await publicClient.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [rule.owner_wallet as Address, executor],
        })) as bigint;

        if (allowance < amountToSave) {
          const skipReason =
            "Auto-save awaiting USDC allowance to Earn Auto-Save executor.";
          await supabase
            .from(rulesTable)
            .update({
              last_skip_reason: skipReason,
              next_run_at: nextRunAtFromFrequency(rule.frequency).toISOString(),
              updated_at: nowIso,
            })
            .eq("id", rule.id);

          await supabase.from(executionsTable).insert({
            rule_id: rule.id,
            owner_wallet: rule.owner_wallet,
            amount: formatUnitsToDecimal(amountToSave, decimals),
            amount_units: amountToSave.toString(),
            status: "awaiting_allowance",
            skip_reason: skipReason,
            idempotency_key: executionId,
            due_at: nowIso,
          });
          pendingCount += 1;
          continue;
        }

        const hash = await clients.walletClient.writeContract({
          address: executor,
          abi: earnAutoSaveExecutorAbi,
          functionName: "executeAutoSave",
          args: [executionId, rule.owner_wallet as Address, amountToSave],
          account: clients.account,
          chain: arcTestnet,
        });

        await supabase.from(executionsTable).insert({
          rule_id: rule.id,
          owner_wallet: rule.owner_wallet,
          amount: formatUnitsToDecimal(amountToSave, decimals),
          amount_units: amountToSave.toString(),
          status: "executed",
          tx_hash: hash,
          idempotency_key: executionId,
          due_at: nowIso,
          completed_at: new Date().toISOString(),
        });

        await supabase
          .from(rulesTable)
          .update({
            last_run_at: new Date().toISOString(),
            last_skip_reason: null,
            next_run_at: nextRunAtFromFrequency(rule.frequency).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", rule.id);

        executedCount += 1;
      } else {
        // User must confirm in UI (no silent custody)
        await supabase.from(executionsTable).insert({
          rule_id: rule.id,
          owner_wallet: rule.owner_wallet,
          amount: formatUnitsToDecimal(amountToSave, decimals),
          amount_units: amountToSave.toString(),
          status: "awaiting_wallet",
          skip_reason:
            "Confirm Auto-Save in the Earn app. Funds move only with your wallet signature or allowance.",
          idempotency_key: executionId,
          due_at: nowIso,
        });

        await supabase
          .from(rulesTable)
          .update({
            last_skip_reason: "awaiting_wallet",
            next_run_at: nextRunAtFromFrequency(rule.frequency).toISOString(),
            updated_at: nowIso,
          })
          .eq("id", rule.id);

        pendingCount += 1;
      }
    } catch (err) {
      errors.push(
        `${rule.owner_wallet}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }

  return {
    scannedCount,
    executedCount,
    skippedCount,
    pendingCount,
    errors,
  };
}
