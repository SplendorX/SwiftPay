import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  erc20Abi,
  recurringPlatformFeeBasisPoints,
  swiftRecurepayExecutorAbi,
  swiftRecurepayExecutorAddress,
} from "@/lib/contracts";
import {
  buildAutopayExecutionId,
  type RecurringExecutionRecord,
  type RecurringScheduleRecord,
} from "@/lib/recurring-utils";
import { arcTestnetTokens } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

const executionsTable =
  process.env.SUPABASE_RECURRING_EXECUTIONS_TABLE ?? "recurring_executions";

function getOperatorPrivateKey() {
  return (
    process.env.SWIFTPAY_RECURRING_OPERATOR_PRIVATE_KEY?.trim() ||
    process.env.PRIVATE_KEY?.trim() ||
    null
  );
}

export function isAutopayConfigured() {
  return Boolean(swiftRecurepayExecutorAddress && getOperatorPrivateKey());
}

function createArcClients() {
  const privateKey = getOperatorPrivateKey();

  if (!privateKey) {
    return null;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http(arcTestnet.rpcUrls.default.http[0]);
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport,
  });
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport,
  });

  return { account, publicClient, walletClient };
}

/**
 * Client-wallet autopay eligibility (no server private key).
 * Settlement is performed by the payer's connected wallet in the hub.
 */
export function canAutopaySchedule(schedule: RecurringScheduleRecord) {
  return schedule.autopay_enabled && schedule.status === "active";
}

/** Server operator pull path (optional; requires env private key + executor). */
export function canOperatorAutopaySchedule(schedule: RecurringScheduleRecord) {
  return (
    schedule.autopay_enabled &&
    schedule.wallet_mode === "external" &&
    schedule.status === "active" &&
    isAutopayConfigured()
  );
}

async function verifyOperatorAccount(
  clients: NonNullable<ReturnType<typeof createArcClients>>,
) {
  const onchainOperator = await clients.publicClient.readContract({
    abi: swiftRecurepayExecutorAbi,
    address: swiftRecurepayExecutorAddress as Address,
    functionName: "operator",
  });

  if (
    onchainOperator.toLowerCase() !== clients.account.address.toLowerCase()
  ) {
    return "Recurring operator wallet does not match the onchain executor operator.";
  }

  return null;
}

async function verifyAutopayPreflight(
  clients: NonNullable<ReturnType<typeof createArcClients>>,
  schedule: RecurringScheduleRecord,
) {
  const tokenInfo = arcTestnetTokens[schedule.token_symbol];
  const payer = schedule.owner_wallet as Address;
  const amount = BigInt(schedule.amount_units);
  // Operator path pulls payment + 1% platform fee in one contract call.
  const fee = (amount * BigInt(recurringPlatformFeeBasisPoints)) / 10_000n;
  const required = amount + fee;

  const [balance, allowance] = await Promise.all([
    clients.publicClient.readContract({
      abi: erc20Abi,
      address: tokenInfo.address,
      args: [payer],
      functionName: "balanceOf",
    }),
    clients.publicClient.readContract({
      abi: erc20Abi,
      address: tokenInfo.address,
      args: [payer, swiftRecurepayExecutorAddress as Address],
      functionName: "allowance",
    }),
  ]);

  if (balance < required) {
    return "Payer does not have enough token balance for autopay (payment + 1% platform fee).";
  }

  if (allowance < required) {
    return "Payer has not approved enough allowance for the autopay executor (payment + 1% platform fee).";
  }

  return null;
}

async function recordAutopayAttempt(
  executionId: string,
  ownerWallet: string,
  errorMessage: string,
) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase-server");
  const supabase = createSupabaseAdminClient();

  await supabase
    .from(executionsTable)
    .update({
      attempted_at: new Date().toISOString(),
      error_message: errorMessage.slice(0, 280),
    })
    .eq("id", executionId)
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .eq("status", "awaiting_wallet");
}

export async function executeAutopayForExecution(
  schedule: RecurringScheduleRecord,
  execution: Pick<RecurringExecutionRecord, "id" | "status">,
) {
  if (!swiftRecurepayExecutorAddress) {
    return { error: "SwiftRecurepay executor is not configured." };
  }

  if (execution.status !== "awaiting_wallet") {
    return { error: "Execution is not awaiting payment." };
  }

  if (!canOperatorAutopaySchedule(schedule)) {
    return { error: "Operator autopay is not available for this schedule." };
  }

  const clients = createArcClients();

  if (!clients) {
    return { error: "Recurring operator wallet is not configured." };
  }

  const operatorError = await verifyOperatorAccount(clients);

  if (operatorError) {
    return { error: operatorError };
  }

  const preflightError = await verifyAutopayPreflight(clients, schedule);

  if (preflightError) {
    return { error: preflightError };
  }

  const tokenInfo = arcTestnetTokens[schedule.token_symbol];
  const executionKey = buildAutopayExecutionId(execution.id);
  const alreadyConsumed = await clients.publicClient.readContract({
    abi: swiftRecurepayExecutorAbi,
    address: swiftRecurepayExecutorAddress as Address,
    args: [executionKey],
    functionName: "consumedExecutionIds",
  });

  if (alreadyConsumed) {
    return { error: "This execution was already settled onchain." };
  }

  try {
    const hash = await clients.walletClient.writeContract({
      abi: swiftRecurepayExecutorAbi,
      address: swiftRecurepayExecutorAddress as Address,
      args: [
        executionKey,
        tokenInfo.address,
        schedule.owner_wallet as Address,
        schedule.beneficiary_wallet as Address,
        BigInt(schedule.amount_units),
      ],
      functionName: "executeRecurringPayment",
    });

    const receipt = await clients.publicClient.waitForTransactionReceipt({
      hash,
    });

    if (receipt.status !== "success") {
      return { error: "Autopay transaction reverted onchain." };
    }

    return { txHash: hash as Hash };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Autopay transaction failed.";

    return { error: message };
  }
}

export async function settleAutopayExecution(
  executionId: string,
  ownerWallet: string,
  schedule: RecurringScheduleRecord,
  execution: Pick<RecurringExecutionRecord, "id" | "status" | "due_at">,
) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase-server");
  const result = await executeAutopayForExecution(schedule, execution);

  if ("error" in result) {
    await recordAutopayAttempt(
      executionId,
      ownerWallet,
      result.error ?? "Autopay failed.",
    );
    return result;
  }

  const supabase = createSupabaseAdminClient();
  const mutation = await supabase
    .from(executionsTable)
    .update({
      attempted_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      error_message: null,
      status: "confirmed",
      tx_hash: result.txHash,
    })
    .eq("id", executionId)
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .eq("status", "awaiting_wallet")
    .select("*")
    .maybeSingle();

  if (mutation.error || !mutation.data) {
    return {
      error: "Autopay settled onchain but could not update the execution row.",
      txHash: result.txHash,
    };
  }

  const { advanceScheduleAfterConfirmedRun } = await import(
    "@/lib/recurring-service"
  );
  await advanceScheduleAfterConfirmedRun(schedule.id, execution.due_at);

  return { execution: mutation.data, txHash: result.txHash };
}

async function settlePendingAutopayRows(
  pending: Array<
    Pick<
      RecurringExecutionRecord,
      "id" | "status" | "due_at" | "owner_wallet" | "schedule_id"
    >
  >,
  scheduleMap: Map<string, RecurringScheduleRecord>,
) {
  const results = [];
  const errors: Array<{ executionId: string; message: string }> = [];
  let confirmedCount = 0;

  for (const execution of pending) {
    const schedule = scheduleMap.get(execution.schedule_id);

    if (!schedule || !canOperatorAutopaySchedule(schedule)) {
      continue;
    }

    const settled = await settleAutopayExecution(
      execution.id,
      execution.owner_wallet,
      schedule,
      execution,
    );

    results.push({
      executionId: execution.id,
      ...settled,
    });

    if ("execution" in settled) {
      confirmedCount += 1;
    } else if ("error" in settled) {
      errors.push({
        executionId: execution.id,
        message: settled.error ?? "Autopay failed.",
      });
    }
  }

  return {
    attemptedCount: results.length,
    confirmedCount,
    errors,
    results,
    scannedCount: pending.length,
  };
}

export async function processAutopayExecutions(limit = 25) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase-server");

  if (!isAutopayConfigured()) {
    return {
      attemptedCount: 0,
      confirmedCount: 0,
      errors: [] as Array<{ executionId: string; message: string }>,
      results: [],
      scannedCount: 0,
    };
  }

  const supabase = createSupabaseAdminClient();
  const schedulesTable =
    process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";
  const pending = await supabase
    .from(executionsTable)
    .select("*")
    .eq("status", "awaiting_wallet")
    .order("due_at", { ascending: true })
    .limit(limit);

  if (pending.error || !pending.data?.length) {
    return {
      attemptedCount: 0,
      confirmedCount: 0,
      errors: [] as Array<{ executionId: string; message: string }>,
      results: [],
      scannedCount: pending.data?.length ?? 0,
    };
  }

  const scheduleIds = [
    ...new Set(pending.data.map((execution) => execution.schedule_id)),
  ];
  const schedules = await supabase
    .from(schedulesTable)
    .select("*")
    .in("id", scheduleIds);

  if (schedules.error || !schedules.data) {
    return {
      attemptedCount: 0,
      confirmedCount: 0,
      errors: [] as Array<{ executionId: string; message: string }>,
      results: [],
      scannedCount: pending.data.length,
    };
  }

  const scheduleMap = new Map(
    schedules.data.map((schedule) => [
      schedule.id,
      schedule as RecurringScheduleRecord,
    ]),
  );

  return settlePendingAutopayRows(pending.data, scheduleMap);
}

/** Settle awaiting autopay executions for one owner only. */
export async function processAutopayExecutionsForOwner(
  ownerWallet: string,
  limit = 25,
) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase-server");

  if (!isAutopayConfigured()) {
    return {
      attemptedCount: 0,
      confirmedCount: 0,
      errors: [] as Array<{ executionId: string; message: string }>,
      results: [],
      scannedCount: 0,
    };
  }

  const supabase = createSupabaseAdminClient();
  const schedulesTable =
    process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";
  const pending = await supabase
    .from(executionsTable)
    .select("*")
    .eq("status", "awaiting_wallet")
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .order("due_at", { ascending: true })
    .limit(limit);

  if (pending.error || !pending.data?.length) {
    return {
      attemptedCount: 0,
      confirmedCount: 0,
      errors: [] as Array<{ executionId: string; message: string }>,
      results: [],
      scannedCount: pending.data?.length ?? 0,
    };
  }

  const scheduleIds = [
    ...new Set(pending.data.map((execution) => execution.schedule_id)),
  ];
  const schedules = await supabase
    .from(schedulesTable)
    .select("*")
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .in("id", scheduleIds);

  if (schedules.error || !schedules.data) {
    return {
      attemptedCount: 0,
      confirmedCount: 0,
      errors: [] as Array<{ executionId: string; message: string }>,
      results: [],
      scannedCount: pending.data.length,
    };
  }

  const scheduleMap = new Map(
    schedules.data.map((schedule) => [
      schedule.id,
      schedule as RecurringScheduleRecord,
    ]),
  );

  return settlePendingAutopayRows(pending.data, scheduleMap);
}