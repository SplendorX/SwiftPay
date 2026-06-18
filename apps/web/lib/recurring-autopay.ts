import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
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

export function canAutopaySchedule(schedule: RecurringScheduleRecord) {
  return (
    schedule.autopay_enabled &&
    schedule.wallet_mode === "external" &&
    schedule.status === "active" &&
    isAutopayConfigured()
  );
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

  if (!canAutopaySchedule(schedule)) {
    return { error: "Autopay is not enabled for this schedule." };
  }

  const clients = createArcClients();

  if (!clients) {
    return { error: "Recurring operator wallet is not configured." };
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
  execution: Pick<RecurringExecutionRecord, "id" | "status">,
) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase-server");
  const result = await executeAutopayForExecution(schedule, execution);

  if ("error" in result) {
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

  return { execution: mutation.data, txHash: result.txHash };
}

export async function processAutopayExecutions(limit = 25) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase-server");

  if (!isAutopayConfigured()) {
    return {
      attemptedCount: 0,
      confirmedCount: 0,
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

  const results = [];
  let confirmedCount = 0;

  for (const execution of pending.data) {
    const schedule = scheduleMap.get(execution.schedule_id);

    if (!schedule || !canAutopaySchedule(schedule)) {
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
    }
  }

  return {
    attemptedCount: results.length,
    confirmedCount,
    results,
    scannedCount: pending.data.length,
  };
}