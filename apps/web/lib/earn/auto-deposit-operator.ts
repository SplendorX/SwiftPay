import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseUnits,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { erc20Abi } from "@/lib/contracts";
import {
  listDueRules,
  markRuleError,
  markRuleRan,
  recordExecution,
  type AutoDepositRule,
} from "@/lib/earn/auto-deposit";
import {
  earnAutoSaveExecutorAbi,
  earnAutoSaveExecutorAddress,
  earnAutoSaveExecutors,
} from "@/lib/earn/auto-save";
import { hasEntitlement } from "@/lib/referral/entitlement-service";
import { onchainFacts } from "@/lib/onchain-facts";

/**
 * Runs the UNATTENDED half of Earn auto-deposit.
 *
 * The executor pulls USDC the owner has already approved and deposits it into
 * the vault for them. Every guard below exists because this code spends other
 * people's money without asking: the operator never decides the amount, only
 * whether a rule the owner wrote is due and still within its own limits.
 */

function operatorPrivateKey() {
  return (
    process.env.SWIFTPAY_EARN_OPERATOR_PRIVATE_KEY?.trim() ||
    process.env.SWIFTPAY_RECURRING_OPERATOR_PRIVATE_KEY?.trim() ||
    null
  );
}

export function isUnattendedDepositConfigured() {
  return Boolean(
    (Object.keys(earnAutoSaveExecutors()).length > 0 || earnAutoSaveExecutorAddress()) &&
      operatorPrivateKey(),
  );
}

function clients() {
  const privateKey = operatorPrivateKey();
  if (!privateKey) return null;

  const chain = onchainFacts.chain as Chain;
  const transport = http(onchainFacts.rpcUrl);
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return {
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
}

/** Deterministic per rule and period, so a retry cannot deposit twice. */
function executionId(rule: AutoDepositRule) {
  return `earn-auto-deposit:${rule.id}:${rule.next_run_at}`;
}

type RunOutcome = {
  reason?: string;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  txHash?: string;
  wallet: string;
};

async function runRule(
  rule: AutoDepositRule,
  ctx: NonNullable<ReturnType<typeof clients>>,
  executor: Address,
): Promise<RunOutcome> {
  const owner = getAddress(rule.wallet_address);
  const usdc = onchainFacts.usdcAddress;
  const id = executionId(rule);

  if (!usdc) {
    return { reason: "USDC is not configured.", status: "FAILED", wallet: owner };
  }

  const amountUnits = parseUnits(rule.amount_usdc.toString(), 6);

  const [balance, allowance] = await Promise.all([
    ctx.publicClient.readContract({
      abi: erc20Abi,
      address: usdc,
      args: [owner],
      functionName: "balanceOf",
    }) as Promise<bigint>,
    ctx.publicClient.readContract({
      abi: erc20Abi,
      address: usdc,
      args: [owner, executor],
      functionName: "allowance",
    }) as Promise<bigint>,
  ]);

  // The owner's floor is enforced here, not just in the UI: it is the promise
  // that a rule can never empty the wallet it draws from.
  const floorUnits = parseUnits(rule.min_balance_floor.toString(), 6);
  if (balance < amountUnits + floorUnits) {
    return {
      reason: "Balance would fall below the minimum you set.",
      status: "SKIPPED",
      wallet: owner,
    };
  }

  if (allowance < amountUnits) {
    return {
      reason: "The allowance for the Invest executor is too low. Re-approve it.",
      status: "SKIPPED",
      wallet: owner,
    };
  }

  const hash = await ctx.walletClient.writeContract({
    abi: earnAutoSaveExecutorAbi,
    address: executor,
    args: [id as `0x${string}`, owner, amountUnits],
    functionName: "executeAutoSave",
  });

  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    return { reason: "The deposit reverted on chain.", status: "FAILED", txHash: hash, wallet: owner };
  }

  return { status: "SUCCEEDED", txHash: hash, wallet: owner };
}

export async function processUnattendedDeposits(limit = 15) {
  const ctx = clients();

  if (!isUnattendedDepositConfigured() || !ctx) {
    return {
      configured: false,
      processed: 0,
      results: [] as Array<RunOutcome & { ruleId: string }>,
    };
  }

  const due = await listDueRules("UNATTENDED", limit);
  const results: Array<RunOutcome & { ruleId: string }> = [];

  for (const rule of due) {
    let outcome: RunOutcome;
    try {
      // Access is annual. An expired term must stop the schedule rather than
      // keep spending on behalf of someone who is no longer subscribed.
      const subscribed = await hasEntitlement(
        rule.wallet_address,
        "EARN_AUTO_DEPOSIT",
      );
      // Each executor deposits into one vault only, so the rule's own vault
      // decides which one runs it.
      const executor = earnAutoSaveExecutorAddress(rule.vault_address);
      outcome = !subscribed
        ? {
            reason:
              "Your automatic deposits subscription has expired. Renew it to resume.",
            status: "SKIPPED",
            wallet: rule.wallet_address,
          }
        : !executor
          ? {
              reason: "Unattended deposits are not available for this vault.",
              status: "SKIPPED",
              wallet: rule.wallet_address,
            }
          : await runRule(rule, ctx, executor);
    } catch (cause) {
      outcome = {
        reason: cause instanceof Error ? cause.message.split("\n")[0] : "Run failed.",
        status: "FAILED",
        wallet: rule.wallet_address,
      };
    }

    await recordExecution({
      amountUsdc: rule.amount_usdc,
      executionId: executionId(rule),
      mode: "UNATTENDED",
      reason: outcome.reason,
      ruleId: rule.id,
      status: outcome.status,
      txHash: outcome.txHash,
      vaultAddress: rule.vault_address,
      walletAddress: rule.wallet_address,
    });

    if (outcome.status === "SUCCEEDED") {
      await markRuleRan({
        frequency: rule.frequency,
        walletAddress: rule.wallet_address,
      });
    } else {
      // A skip or failure leaves the rule due so the next tick retries it,
      // but the reason is stored so the owner is not left guessing.
      await markRuleError(rule.wallet_address, outcome.reason ?? "Run failed.");
    }

    results.push({ ...outcome, ruleId: rule.id });
  }

  return { configured: true, processed: results.length, results };
}
