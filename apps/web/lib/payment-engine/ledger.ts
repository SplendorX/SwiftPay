import { createSupabaseAdminClient } from "@/lib/supabase-server";

import {
  isPaymentIntentAsset,
  isPaymentIntentInitiatorType,
  isPaymentIntentStatus,
  type PaymentIntent,
  type PaymentIntentRail,
  type PaymentIntentStatus,
} from "@/lib/payment-engine/intent";

export const paymentIntentsTable =
  process.env.SUPABASE_PAYMENT_INTENTS_TABLE ?? "payment_intents";
export const paymentAttemptsTable =
  process.env.SUPABASE_PAYMENT_ATTEMPTS_TABLE ?? "payment_attempts";
export const paymentSettlementsTable =
  process.env.SUPABASE_PAYMENT_SETTLEMENTS_TABLE ?? "payment_settlements";

export type PaymentAttemptStatus =
  | "queued"
  | "submitted"
  | "confirmed"
  | "failed";

export type PaymentAttemptRecord = {
  attemptId: string;
  intentId: string;
  rail: PaymentIntentRail | null;
  executor: string | null;
  status: PaymentAttemptStatus;
  txHash: string | null;
  providerTransactionId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentSettlementRecord = {
  settlementId: string;
  intentId: string;
  attemptId: string | null;
  txHash: string | null;
  chainId: number | null;
  amountUnits: string;
  feeUnits: string;
  settledAt: string;
};

type IntentRow = {
  intent_id: string;
  initiator_type: string;
  initiator_id: string;
  recipient: string;
  resolved_recipient: string | null;
  asset: string;
  amount_units: string;
  chain_id: number;
  rail: string | null;
  metadata: Record<string, unknown> | null;
  idempotency_key: string;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type AttemptRow = {
  attempt_id: string;
  intent_id: string;
  rail: string | null;
  executor: string | null;
  status: string;
  tx_hash: string | null;
  provider_transaction_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type SettlementRow = {
  settlement_id: string;
  intent_id: string;
  attempt_id: string | null;
  tx_hash: string | null;
  chain_id: number | null;
  amount_units: string;
  fee_units: string;
  settled_at: string;
};

function railFromRow(value: string | null): PaymentIntentRail | undefined {
  switch (value) {
    case "arc-native":
    case "cctp":
    case "batch":
    case "recurring":
    case "agent-direct":
      return value;
    default:
      return undefined;
  }
}

function attemptStatusFromRow(value: string): PaymentAttemptStatus {
  switch (value) {
    case "submitted":
    case "confirmed":
    case "failed":
      return value;
    default:
      return "queued";
  }
}

export function intentFromRow(row: IntentRow): PaymentIntent {
  return {
    intentId: row.intent_id,
    initiatorType: isPaymentIntentInitiatorType(row.initiator_type)
      ? row.initiator_type
      : "human",
    initiatorId: row.initiator_id,
    recipient: row.recipient,
    resolvedRecipient:
      (row.resolved_recipient as PaymentIntent["resolvedRecipient"]) ??
      undefined,
    asset: isPaymentIntentAsset(row.asset) ? row.asset : "USDC",
    amountUnits: BigInt(row.amount_units),
    chainId: row.chain_id,
    rail: railFromRow(row.rail),
    metadata: row.metadata ?? undefined,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    status: isPaymentIntentStatus(row.status) ? row.status : "pending",
  };
}

function attemptFromRow(row: AttemptRow): PaymentAttemptRecord {
  return {
    attemptId: row.attempt_id,
    intentId: row.intent_id,
    rail: railFromRow(row.rail) ?? null,
    executor: row.executor,
    status: attemptStatusFromRow(row.status),
    txHash: row.tx_hash,
    providerTransactionId: row.provider_transaction_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function settlementFromRow(row: SettlementRow): PaymentSettlementRecord {
  return {
    settlementId: row.settlement_id,
    intentId: row.intent_id,
    attemptId: row.attempt_id,
    txHash: row.tx_hash,
    chainId: row.chain_id,
    amountUnits: row.amount_units,
    feeUnits: row.fee_units,
    settledAt: row.settled_at,
  };
}

/**
 * Persist a new intent. Re-inserting the same idempotency key returns the
 * intent already on file instead of creating a duplicate payment.
 */
export async function insertIntent(intent: PaymentIntent) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentIntentsTable)
    .insert({
      intent_id: intent.intentId,
      initiator_type: intent.initiatorType,
      initiator_id: intent.initiatorId.toLowerCase(),
      recipient: intent.recipient,
      resolved_recipient: intent.resolvedRecipient?.toLowerCase() ?? null,
      asset: intent.asset,
      amount_units: intent.amountUnits.toString(),
      chain_id: intent.chainId,
      rail: intent.rail ?? null,
      metadata: intent.metadata ?? null,
      idempotency_key: intent.idempotencyKey,
      status: intent.status,
      created_at: intent.createdAt,
    })
    .select("*")
    .single<IntentRow>();

  if (error) {
    // 23505 = unique_violation on idempotency_key.
    if (error.code === "23505") {
      const existing = await loadIntentByIdempotencyKey(intent.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    throw new Error(error.message || "Payment intent could not be saved.");
  }

  return intentFromRow(data);
}

export async function updateIntentStatus(
  intentId: string,
  status: PaymentIntentStatus,
  patch: {
    rail?: PaymentIntentRail;
    resolvedRecipient?: string;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const supabase = createSupabaseAdminClient();

  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (patch.rail) {
    update.rail = patch.rail;
  }

  if (patch.resolvedRecipient) {
    update.resolved_recipient = patch.resolvedRecipient.toLowerCase();
  }

  if (patch.metadata) {
    update.metadata = patch.metadata;
  }

  if (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    update.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from(paymentIntentsTable)
    .update(update)
    .eq("intent_id", intentId)
    .select("*")
    .single<IntentRow>();

  if (error) {
    throw new Error(error.message || "Payment intent could not be updated.");
  }

  return intentFromRow(data);
}

export async function loadIntentById(intentId: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentIntentsTable)
    .select("*")
    .eq("intent_id", intentId)
    .maybeSingle<IntentRow>();

  if (error) {
    throw new Error(error.message || "Payment intent could not be loaded.");
  }

  return data ? intentFromRow(data) : null;
}

export async function loadIntentByIdempotencyKey(idempotencyKey: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentIntentsTable)
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<IntentRow>();

  if (error) {
    throw new Error(error.message || "Payment intent could not be loaded.");
  }

  return data ? intentFromRow(data) : null;
}

export async function loadIntentsForWallet(
  initiatorId: string,
  options: { limit?: number; statuses?: PaymentIntentStatus[] } = {},
) {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from(paymentIntentsTable)
    .select("*")
    .eq("initiator_id", initiatorId.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 25, 1), 200));

  if (options.statuses?.length) {
    query = query.in("status", options.statuses);
  }

  const { data, error } = await query.returns<IntentRow[]>();

  if (error) {
    throw new Error(error.message || "Payment intents could not be loaded.");
  }

  return (data ?? []).map(intentFromRow);
}

export async function insertAttempt(input: {
  intentId: string;
  rail?: PaymentIntentRail;
  executor?: string;
  status?: PaymentAttemptStatus;
}) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentAttemptsTable)
    .insert({
      intent_id: input.intentId,
      rail: input.rail ?? null,
      executor: input.executor ?? null,
      status: input.status ?? "queued",
    })
    .select("*")
    .single<AttemptRow>();

  if (error) {
    throw new Error(error.message || "Payment attempt could not be saved.");
  }

  return attemptFromRow(data);
}

export async function updateAttemptStatus(
  attemptId: string,
  status: PaymentAttemptStatus,
  patch: {
    txHash?: string;
    providerTransactionId?: string;
    errorMessage?: string;
  } = {},
) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentAttemptsTable)
    .update({
      status,
      tx_hash: patch.txHash ?? null,
      provider_transaction_id: patch.providerTransactionId ?? null,
      error_message: patch.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("attempt_id", attemptId)
    .select("*")
    .single<AttemptRow>();

  if (error) {
    throw new Error(error.message || "Payment attempt could not be updated.");
  }

  return attemptFromRow(data);
}

export async function loadAttemptsForIntent(intentId: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentAttemptsTable)
    .select("*")
    .eq("intent_id", intentId)
    .order("created_at", { ascending: true })
    .returns<AttemptRow[]>();

  if (error) {
    throw new Error(error.message || "Payment attempts could not be loaded.");
  }

  return (data ?? []).map(attemptFromRow);
}

export async function recordSettlement(input: {
  intentId: string;
  attemptId?: string;
  txHash?: string;
  chainId?: number;
  amountUnits: bigint;
  feeUnits?: bigint;
}) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentSettlementsTable)
    .insert({
      intent_id: input.intentId,
      attempt_id: input.attemptId ?? null,
      tx_hash: input.txHash ?? null,
      chain_id: input.chainId ?? null,
      amount_units: input.amountUnits.toString(),
      fee_units: (input.feeUnits ?? 0n).toString(),
    })
    .select("*")
    .single<SettlementRow>();

  if (error) {
    throw new Error(error.message || "Settlement could not be recorded.");
  }

  return settlementFromRow(data);
}

export async function loadSettlementsForIntent(intentId: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentSettlementsTable)
    .select("*")
    .eq("intent_id", intentId)
    .order("settled_at", { ascending: true })
    .returns<SettlementRow[]>();

  if (error) {
    throw new Error(error.message || "Settlements could not be loaded.");
  }

  return (data ?? []).map(settlementFromRow);
}

/**
 * Spend for an initiator since `since`, counting only intents that reached or
 * passed execution. Used by the policy engine's daily cap.
 */
export async function sumSpentUnitsSince(initiatorId: string, since: Date) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(paymentIntentsTable)
    .select("amount_units,metadata")
    .eq("initiator_id", initiatorId.toLowerCase())
    .gte("created_at", since.toISOString())
    .in("status", ["approved", "executing", "submitted", "confirming", "completed"])
    .returns<{ amount_units: string; metadata: Record<string, unknown> | null }[]>();

  if (error) {
    throw new Error(error.message || "Daily spend could not be calculated.");
  }

  return (data ?? []).reduce((total, row) => {
    // Platform fees are SaphraONE's revenue, not the user's spend — counting
    // them here would quietly eat the policy budget and make "spent today"
    // disagree with what the person actually sent.
    if (row.metadata?.kind === "allie-per-payment-fee") {
      return total;
    }

    try {
      return total + BigInt(row.amount_units);
    } catch {
      return total;
    }
  }, 0n);
}

/** Intent plus its attempts and settlements — the full lifecycle record. */
export async function loadIntentLifecycle(intentId: string) {
  const intent = await loadIntentById(intentId);

  if (!intent) {
    return null;
  }

  const [attempts, settlements] = await Promise.all([
    loadAttemptsForIntent(intentId),
    loadSettlementsForIntent(intentId),
  ]);

  return { intent, attempts, settlements };
}

/** Intents are serialized with amountUnits as a decimal string (bigint-safe). */
export function serializeIntent(intent: PaymentIntent) {
  return {
    ...intent,
    amountUnits: intent.amountUnits.toString(),
  };
}
