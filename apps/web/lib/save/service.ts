import { createPublicClient, http, type Hash, type Address } from "viem";

import { swiftSaveVaultAbi } from "@/lib/save/abis";
import { swiftSaveVaultAddress } from "@/lib/save/config";
import { trackSwiftSaveEvent, trackSpendSavePercent } from "@/lib/save/analytics";
import {
  calculateSaveAmountUnits,
  formatUnitsToDecimal,
  totalRequiredUnits,
} from "@/lib/save/decimal";
import { isEligibleOutgoingPayment } from "@/lib/save/eligibility";
import {
  copyManualSaveSuccess,
  copySpendSaveDisabled,
  copySpendSavePaused,
  copySpendSaveResumed,
  copySpendSaveSuccess,
  copyTargetReached,
  createSavingsNotification,
  formatAmountForCopy,
} from "@/lib/save/notifications";
import { pocketIdToBytes32 } from "@/lib/save/pocket-id";
import { capSaveAmountForTarget, isTargetReached } from "@/lib/save/target";

export { isEligibleOutgoingPayment } from "@/lib/save/eligibility";
import {
  SAVINGS_POCKET_LIMIT,
  type SavingsLockKind,
  type SavingsPocketRecord,
  type SavingsSummary,
  type SavingsTransactionRecord,
  type SpendSaveConfigRecord,
  type SpendSaveEventRecord,
} from "@/lib/save/types";
import {
  amountFromUnits,
  unitsToBigInt,
} from "@/lib/save/validation";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

const reconciliationTable =
  process.env.SUPABASE_SAVINGS_RECONCILIATION_TABLE ??
  "savings_reconciliation_alerts";

const pocketsTable =
  process.env.SUPABASE_SAVINGS_POCKETS_TABLE ?? "savings_pockets";
const transactionsTable =
  process.env.SUPABASE_SAVINGS_TRANSACTIONS_TABLE ?? "savings_transactions";
const spendSaveTable =
  process.env.SUPABASE_SPEND_SAVE_CONFIGS_TABLE ?? "spend_save_configs";
const spendSaveEventsTable =
  process.env.SUPABASE_SPEND_SAVE_EVENTS_TABLE ?? "spend_save_events";

export function readSavingsSupabaseError(
  error: { message?: string } | null,
  fallback: string,
) {
  const message = error?.message ?? "";
  if (message.toLowerCase().includes("permission denied")) {
    return "Supabase rejected access to Swift+Save tables. Run packages/database/supabase/swift-save.sql.";
  }
  if (message.toLowerCase().includes("does not exist")) {
    return "Create Swift+Save tables with packages/database/supabase/swift-save.sql.";
  }
  return message || fallback;
}

function missingColumnFromError(message: string): string | null {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column [\"']?([\w]+)[\"']? of relation/i,
    /column [\"']?[\w.]*\.?([\w]+)[\"']? does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function startOfMonthUtc(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

export async function countActivePockets(ownerWallet: string) {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from(pocketsTable)
    .select("id", { count: "exact", head: true })
    .eq("owner_wallet", ownerWallet)
    .eq("status", "active");

  if (error) {
    throw new Error(readSavingsSupabaseError(error, "Could not count pockets."));
  }

  return count ?? 0;
}

export async function assertUnderPocketLimit(ownerWallet: string) {
  const count = await countActivePockets(ownerWallet);
  if (count >= SAVINGS_POCKET_LIMIT) {
    throw new Error(
      `You can have at most ${SAVINGS_POCKET_LIMIT} active savings pockets.`,
    );
  }
}

export async function getPocketForOwner(
  pocketId: string,
  ownerWallet: string,
): Promise<SavingsPocketRecord | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(pocketsTable)
    .select("*")
    .eq("id", pocketId)
    .eq("owner_wallet", ownerWallet)
    .maybeSingle();

  if (error) {
    throw new Error(readSavingsSupabaseError(error, "Could not load pocket."));
  }

  return (data as SavingsPocketRecord | null) ?? null;
}

export async function listPockets(
  ownerWallet: string,
  options: { includeArchived?: boolean } = {},
) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from(pocketsTable)
    .select("*")
    .eq("owner_wallet", ownerWallet)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!options.includeArchived) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(readSavingsSupabaseError(error, "Could not list pockets."));
  }

  return (data ?? []) as SavingsPocketRecord[];
}

export async function createPocket(input: {
  ownerWallet: string;
  name: string;
  icon: string;
  imageUrl: string | null;
  description: string | null;
  targetAmount: string | null;
  targetAmountUnits: string | null;
  currency: ArcTokenSymbol;
  stopAtTarget?: boolean;
  lockKind?: SavingsLockKind;
  lockUntil?: string | null;
  lockDurationDays?: number | null;
}) {
  await assertUnderPocketLimit(input.ownerWallet);

  const supabase = createSupabaseAdminClient();
  let payload: Record<string, unknown> = {
    owner_wallet: input.ownerWallet,
    name: input.name,
    icon: input.icon,
    image_url: input.imageUrl,
    description: input.description,
    target_amount: input.targetAmount,
    target_amount_units: input.targetAmountUnits,
    current_balance: "0",
    current_balance_units: "0",
    currency: input.currency,
    status: "active",
    stop_at_target: input.stopAtTarget === true,
    target_reached_at: null,
    lock_kind: input.lockKind === "fixed" ? "fixed" : "flexible",
    lock_until: input.lockKind === "fixed" ? (input.lockUntil ?? null) : null,
    lock_duration_days:
      input.lockKind === "fixed" ? (input.lockDurationDays ?? null) : null,
    updated_at: new Date().toISOString(),
  };

  let data: SavingsPocketRecord | null = null;
  let lastError: { message?: string } | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const inserted = await supabase
      .from(pocketsTable)
      .insert(payload)
      .select("*")
      .single();

    if (!inserted.error && inserted.data) {
      data = inserted.data as SavingsPocketRecord;
      break;
    }

    lastError = inserted.error;
    const missing = missingColumnFromError(inserted.error?.message ?? "");
    if (missing && missing in payload) {
      const next = { ...payload };
      delete next[missing];
      payload = next;
      continue;
    }
    break;
  }

  if (!data) {
    throw new Error(
      readSavingsSupabaseError(lastError, "Could not create savings pocket."),
    );
  }

  trackSwiftSaveEvent("swift_save_pocket_created", {
    pocketId: data.id,
    currency: input.currency,
    hasTarget: Boolean(input.targetAmount),
    lockKind: input.lockKind === "fixed" ? "fixed" : "flexible",
  });

  return data;
}

export async function updatePocket(
  pocketId: string,
  ownerWallet: string,
  patch: Partial<{
    name: string;
    icon: string;
    image_url: string | null;
    description: string | null;
    target_amount: string | null;
    target_amount_units: string | null;
    stop_at_target: boolean;
    lock_kind: SavingsLockKind;
    lock_until: string | null;
    lock_duration_days: number | null;
  }>,
) {
  const pocket = await getPocketForOwner(pocketId, ownerWallet);
  if (!pocket) {
    throw new Error("Savings pocket not found.");
  }
  if (pocket.status === "archived") {
    throw new Error("Archived pockets cannot be edited.");
  }

  const supabase = createSupabaseAdminClient();
  let payload: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  let lastError: { message?: string } | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const updated = await supabase
      .from(pocketsTable)
      .update(payload)
      .eq("id", pocketId)
      .eq("owner_wallet", ownerWallet)
      .select("*")
      .single();

    if (!updated.error && updated.data) {
      return updated.data as SavingsPocketRecord;
    }

    lastError = updated.error;
    const missing = missingColumnFromError(updated.error?.message ?? "");
    if (missing && missing in payload) {
      const next = { ...payload };
      delete next[missing];
      payload = next;
      continue;
    }
    break;
  }

  throw new Error(
    readSavingsSupabaseError(lastError, "Could not update savings pocket."),
  );
}

export async function archivePocket(pocketId: string, ownerWallet: string) {
  const pocket = await getPocketForOwner(pocketId, ownerWallet);
  if (!pocket) {
    throw new Error("Savings pocket not found.");
  }
  if (pocket.status === "archived") {
    return pocket;
  }

  const balance = unitsToBigInt(pocket.current_balance_units);
  if (balance > 0n) {
    throw new Error(
      "Withdraw all funds before archiving this savings pocket.",
    );
  }

  // Block archive if Spend&Save points here and is still enabled
  const config = await getSpendSaveConfig(ownerWallet);
  if (config && config.pocket_id === pocketId && config.enabled) {
    throw new Error(
      "Disable or retarget Spend&Save before archiving this pocket.",
    );
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(pocketsTable)
    .update({
      status: "archived",
      archived_at: now,
      updated_at: now,
    })
    .eq("id", pocketId)
    .eq("owner_wallet", ownerWallet)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not archive savings pocket."),
    );
  }

  return data as SavingsPocketRecord;
}

export async function getOrCreatePendingTransaction(input: {
  ownerWallet: string;
  pocketId: string;
  type: SavingsTransactionRecord["type"];
  amount: string;
  amountUnits: string;
  currency: ArcTokenSymbol;
  idempotencyKey: string;
  relatedPaymentId?: string | null;
  relatedPaymentTxHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();

  const existing = await supabase
    .from(transactionsTable)
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      readSavingsSupabaseError(
        existing.error,
        "Could not check idempotency key.",
      ),
    );
  }

  if (existing.data) {
    const row = existing.data as SavingsTransactionRecord;
    if (
      row.owner_wallet !== input.ownerWallet ||
      row.pocket_id !== input.pocketId ||
      row.amount_units !== input.amountUnits
    ) {
      throw new Error("Idempotency key conflicts with an existing transaction.");
    }
    return row;
  }

  const payload = {
    owner_wallet: input.ownerWallet,
    pocket_id: input.pocketId,
    type: input.type,
    amount: input.amount,
    amount_units: input.amountUnits,
    currency: input.currency,
    status: "PENDING",
    related_payment_id: input.relatedPaymentId ?? null,
    related_payment_tx_hash: input.relatedPaymentTxHash ?? null,
    idempotency_key: input.idempotencyKey,
    metadata: input.metadata ?? {},
  };

  const inserted = await supabase
    .from(transactionsTable)
    .insert(payload)
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    // Race: unique violation → re-read
    if (inserted.error?.message?.toLowerCase().includes("duplicate")) {
      const again = await supabase
        .from(transactionsTable)
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .single();
      if (again.data) return again.data as SavingsTransactionRecord;
    }
    throw new Error(
      readSavingsSupabaseError(
        inserted.error,
        "Could not create savings transaction.",
      ),
    );
  }

  return inserted.data as SavingsTransactionRecord;
}

/**
 * Confirm a savings deposit/withdraw after on-chain settlement.
 * Never treats optimistic client state as final — requires tx hash + optional
 * on-chain balance check when vault is configured.
 */
export async function confirmSavingsTransaction(input: {
  transactionId: string;
  ownerWallet: string;
  txHash: Hash;
  direction: "deposit" | "withdraw";
}) {
  const supabase = createSupabaseAdminClient();
  const loaded = await supabase
    .from(transactionsTable)
    .select("*")
    .eq("id", input.transactionId)
    .eq("owner_wallet", input.ownerWallet)
    .single();

  if (loaded.error || !loaded.data) {
    throw new Error("Savings transaction not found.");
  }

  const tx = loaded.data as SavingsTransactionRecord;

  if (tx.status === "COMPLETED") {
    // Idempotent success
    const pocket = await getPocketForOwner(tx.pocket_id, input.ownerWallet);
    return { transaction: tx, pocket };
  }

  if (tx.status === "FAILED") {
    throw new Error(
      tx.failure_reason ?? "This savings transaction already failed.",
    );
  }

  const pocket = await getPocketForOwner(tx.pocket_id, input.ownerWallet);
  if (!pocket) {
    throw new Error("Savings pocket not found.");
  }
  if (pocket.status === "archived") {
    throw new Error("Cannot settle funds on an archived pocket.");
  }

  const amountUnits = unitsToBigInt(tx.amount_units);
  if (amountUnits <= 0n) {
    throw new Error("Invalid transaction amount.");
  }

  const currency = tx.currency as ArcTokenSymbol;
  const token = arcTestnetTokens[currency];
  const vault = swiftSaveVaultAddress();

  // Mark submitted
  await supabase
    .from(transactionsTable)
    .update({
      status:
        input.direction === "deposit" ? "SAVINGS_SUBMITTED" : "PROCESSING",
      tx_hash: input.txHash,
    })
    .eq("id", tx.id)
    .eq("owner_wallet", input.ownerWallet);

  // Verify receipt exists (source of truth gate). Prefer a single lookup —
  // callers should already have waited for inclusion. A long wait here
  // blows the API timeout and Spend&Save never credits the pocket.
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });

  let receipt: Awaited<
    ReturnType<typeof publicClient.getTransactionReceipt>
  > | null = null;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: input.txHash });
  } catch {
    receipt = null;
  }

  if (!receipt) {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: input.txHash,
      confirmations: 1,
      pollingInterval: 400,
      timeout: 12_000,
    });
  }

  if (receipt.status !== "success") {
    const failedAt = new Date().toISOString();
    await supabase
      .from(transactionsTable)
      .update({
        status: "FAILED",
        failure_reason: "On-chain transaction reverted.",
        failed_at: failedAt,
        tx_hash: input.txHash,
      })
      .eq("id", tx.id);

    throw new Error("On-chain savings transaction reverted.");
  }

  // Optional: reconcile against vault balance
  if (vault) {
    try {
      const onChain = (await publicClient.readContract({
        address: vault,
        abi: swiftSaveVaultAbi,
        functionName: "pocketBalance",
        args: [
          input.ownerWallet as Address,
          pocketIdToBytes32(pocket.id),
          token.address,
        ],
      })) as bigint;

      const dbBalance = unitsToBigInt(pocket.current_balance_units);
      const expected =
        input.direction === "deposit"
          ? dbBalance + amountUnits
          : dbBalance - amountUnits;

      // Soft check — if vault is ahead/behind due to race, still apply delta
      // but flag large mismatches
      if (input.direction === "withdraw" && dbBalance < amountUnits) {
        throw new Error("Insufficient pocket balance.");
      }

      // Prefer on-chain as source of truth after successful tx
      void onChain;
      void expected;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Insufficient pocket balance."
      ) {
        throw error;
      }
      // Vault read failures do not block confirmation if receipt succeeded
    }
  }

  if (input.direction === "withdraw") {
    const current = unitsToBigInt(pocket.current_balance_units);
    if (current < amountUnits) {
      const failedAt = new Date().toISOString();
      await supabase
        .from(transactionsTable)
        .update({
          status: "FAILED",
          failure_reason: "Insufficient pocket balance.",
          failed_at: failedAt,
          tx_hash: input.txHash,
        })
        .eq("id", tx.id);
      throw new Error("Insufficient pocket balance.");
    }
  }

  const currentUnits = unitsToBigInt(pocket.current_balance_units);
  const nextUnits =
    input.direction === "deposit"
      ? currentUnits + amountUnits
      : currentUnits - amountUnits;

  if (nextUnits < 0n) {
    throw new Error("Pocket balance cannot go negative.");
  }

  const nextBalance = amountFromUnits(nextUnits, currency);
  const now = new Date().toISOString();
  const targetUnits = pocket.target_amount_units
    ? unitsToBigInt(pocket.target_amount_units)
    : null;
  const reachedTarget =
    input.direction === "deposit" && isTargetReached(nextUnits, targetUnits);
  const justReached =
    reachedTarget &&
    !isTargetReached(currentUnits, targetUnits);

  const pocketUpdate = await supabase
    .from(pocketsTable)
    .update({
      current_balance: nextBalance,
      current_balance_units: nextUnits.toString(),
      updated_at: now,
      ...(justReached
        ? { target_reached_at: pocket.target_reached_at ?? now }
        : {}),
    })
    .eq("id", pocket.id)
    .eq("owner_wallet", input.ownerWallet)
    .eq("current_balance_units", pocket.current_balance_units)
    .select("*")
    .single();

  if (pocketUpdate.error || !pocketUpdate.data) {
    // Concurrent update — mark reconciliation
    await supabase
      .from(transactionsTable)
      .update({
        status: "REQUIRES_RECONCILIATION",
        tx_hash: input.txHash,
        failure_reason: "Concurrent balance update; requires reconciliation.",
      })
      .eq("id", tx.id);

    await createReconciliationAlert({
      ownerWallet: input.ownerWallet,
      transactionId: tx.id,
      pocketId: pocket.id,
      alertType: "balance_conflict",
      message: "Concurrent balance update; requires reconciliation.",
    });

    throw new Error(
      "Balance update conflict. Transaction marked for reconciliation.",
    );
  }

  const txUpdate = await supabase
    .from(transactionsTable)
    .update({
      status: "COMPLETED",
      tx_hash: input.txHash,
      confirmed_at: now,
      failure_reason: null,
    })
    .eq("id", tx.id)
    .select("*")
    .single();

  if (txUpdate.error || !txUpdate.data) {
    throw new Error(
      readSavingsSupabaseError(
        txUpdate.error,
        "Could not finalize savings transaction.",
      ),
    );
  }

  const completed = txUpdate.data as SavingsTransactionRecord;
  const updatedPocket = pocketUpdate.data as SavingsPocketRecord;

  // Notifications + analytics (non-sensitive)
  if (input.direction === "deposit") {
    if (tx.type === "SPEND_SAVE") {
      trackSwiftSaveEvent("spend_save_completed", {
        pocketId: pocket.id,
        currency,
      });
      const paymentAmt =
        typeof tx.metadata?.paymentAmount === "string"
          ? tx.metadata.paymentAmount
          : amountFromUnits(
              unitsToBigInt(String(tx.metadata?.paymentAmountUnits ?? "0")),
              currency,
            );
      const copy = copySpendSaveSuccess(
        formatAmountForCopy(amountUnits, currency),
        paymentAmt,
        updatedPocket.name,
        currency,
      );
      await createSavingsNotification({
        ownerWallet: input.ownerWallet,
        kind: "spend_save_success",
        title: copy.title,
        body: copy.body,
        pocketId: pocket.id,
        transactionId: completed.id,
      });
    } else {
      trackSwiftSaveEvent("swift_save_deposit_completed", {
        pocketId: pocket.id,
        currency,
      });
      const copy = copyManualSaveSuccess(
        formatAmountForCopy(amountUnits, currency),
        updatedPocket.name,
        currency,
      );
      await createSavingsNotification({
        ownerWallet: input.ownerWallet,
        kind: "manual_save_success",
        title: copy.title,
        body: copy.body,
        pocketId: pocket.id,
        transactionId: completed.id,
      });
    }

    if (justReached && updatedPocket.target_amount) {
      trackSwiftSaveEvent("swift_save_target_reached", {
        pocketId: pocket.id,
        currency,
        hasTarget: true,
      });
      const copy = copyTargetReached(
        updatedPocket.name,
        updatedPocket.target_amount,
        currency,
      );
      await createSavingsNotification({
        ownerWallet: input.ownerWallet,
        kind: "target_reached",
        title: copy.title,
        body: copy.body,
        pocketId: pocket.id,
        transactionId: completed.id,
      });
    }
  } else {
    trackSwiftSaveEvent("swift_save_withdrawal_completed", {
      pocketId: pocket.id,
      currency,
    });
  }

  return {
    transaction: completed,
    pocket: updatedPocket,
  };
}

export async function createReconciliationAlert(input: {
  ownerWallet?: string | null;
  transactionId?: string | null;
  pocketId?: string | null;
  alertType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from(reconciliationTable).insert({
      owner_wallet: input.ownerWallet ?? null,
      transaction_id: input.transactionId ?? null,
      pocket_id: input.pocketId ?? null,
      alert_type: input.alertType,
      message: input.message.slice(0, 500),
      metadata: input.metadata ?? {},
    });
  } catch {
    // best-effort
  }
}

export async function failSavingsTransaction(
  transactionId: string,
  ownerWallet: string,
  reason: string,
) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(transactionsTable)
    .update({
      status: "FAILED",
      failure_reason: reason.slice(0, 500),
      failed_at: now,
    })
    .eq("id", transactionId)
    .eq("owner_wallet", ownerWallet)
    .neq("status", "COMPLETED")
    .select("*")
    .single();

  if (error) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not fail transaction."),
    );
  }

  return data as SavingsTransactionRecord;
}

export async function listTransactions(
  ownerWallet: string,
  options: {
    pocketId?: string;
    limit?: number;
    type?: SavingsTransactionRecord["type"];
  } = {},
) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from(transactionsTable)
    .select("*")
    .eq("owner_wallet", ownerWallet)
    .order("created_at", { ascending: false })
    .limit(Math.min(options.limit ?? 50, 100));

  if (options.pocketId) {
    query = query.eq("pocket_id", options.pocketId);
  }
  if (options.type) {
    query = query.eq("type", options.type);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not list savings transactions."),
    );
  }

  return (data ?? []) as SavingsTransactionRecord[];
}

export async function getPocketStats(
  pocketId: string,
  ownerWallet: string,
) {
  const transactions = await listTransactions(ownerWallet, {
    pocketId,
    limit: 100,
  });

  let totalDeposits = 0n;
  let totalWithdrawals = 0n;
  let lastDepositAt: string | null = null;

  for (const tx of transactions) {
    if (tx.status !== "COMPLETED") continue;
    const units = unitsToBigInt(tx.amount_units);
    if (tx.type === "DEPOSIT" || tx.type === "SPEND_SAVE") {
      totalDeposits += units;
      if (
        !lastDepositAt ||
        new Date(tx.confirmed_at ?? tx.created_at) >
          new Date(lastDepositAt)
      ) {
        lastDepositAt = tx.confirmed_at ?? tx.created_at;
      }
    }
    if (tx.type === "WITHDRAWAL") {
      totalWithdrawals += units;
    }
  }

  return {
    totalDeposits,
    totalWithdrawals,
    lastDepositAt,
    transactions,
  };
}

export async function getSummary(
  ownerWallet: string,
  currency: ArcTokenSymbol = "USDC",
): Promise<SavingsSummary> {
  const pockets = await listPockets(ownerWallet, { includeArchived: false });
  const currencyPockets = pockets.filter((p) => p.currency === currency);

  let totalUnits = 0n;
  for (const pocket of currencyPockets) {
    totalUnits += unitsToBigInt(pocket.current_balance_units);
  }

  const monthStart = startOfMonthUtc();
  const supabase = createSupabaseAdminClient();
  const { data: monthRows, error } = await supabase
    .from(transactionsTable)
    .select("amount_units,type,status,currency,confirmed_at,created_at")
    .eq("owner_wallet", ownerWallet)
    .eq("status", "COMPLETED")
    .eq("currency", currency)
    .in("type", ["DEPOSIT", "SPEND_SAVE"])
    .gte("confirmed_at", monthStart)
    .limit(500);

  if (error) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not compute monthly savings."),
    );
  }

  let monthUnits = 0n;
  for (const row of monthRows ?? []) {
    monthUnits += unitsToBigInt(row.amount_units as string);
  }

  const spendSave = await getSpendSaveConfig(ownerWallet);
  let pocketName: string | null = null;
  if (spendSave?.pocket_id) {
    const linked = currencyPockets.find((p) => p.id === spendSave.pocket_id);
    pocketName = linked?.name ?? null;
    if (!pocketName) {
      const archived = await getPocketForOwner(
        spendSave.pocket_id,
        ownerWallet,
      );
      pocketName = archived?.name ?? null;
    }
  }

  const decimals = arcTestnetTokens[currency].decimals;

  return {
    totalSaved: formatUnitsToDecimal(totalUnits, decimals),
    totalSavedUnits: totalUnits.toString(),
    pocketCount: currencyPockets.length,
    monthSaved: formatUnitsToDecimal(monthUnits, decimals),
    monthSavedUnits: monthUnits.toString(),
    currency,
    spendSave: spendSave
      ? {
          enabled: Boolean(spendSave.enabled),
          percentage: Number(spendSave.percentage),
          pocketId: spendSave.pocket_id,
          pocketName,
          paused: Boolean(spendSave.paused_at) && Boolean(spendSave.enabled),
        }
      : null,
  };
}

// ─── Spend&Save ──────────────────────────────────────────────────────────────

export async function getSpendSaveConfig(
  ownerWallet: string,
): Promise<SpendSaveConfigRecord | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(spendSaveTable)
    .select("*")
    .eq("owner_wallet", ownerWallet)
    .maybeSingle();

  if (error) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not load Spend&Save config."),
    );
  }

  return (data as SpendSaveConfigRecord | null) ?? null;
}

export async function upsertSpendSaveConfig(input: {
  ownerWallet: string;
  percentage: string;
  pocketId: string;
  enabled?: boolean;
  eligiblePaymentType?: string;
}) {
  const pocket = await getPocketForOwner(input.pocketId, input.ownerWallet);
  if (!pocket || pocket.status !== "active") {
    throw new Error("Select an active savings pocket for Spend&Save.");
  }

  const supabase = createSupabaseAdminClient();
  const existing = await getSpendSaveConfig(input.ownerWallet);
  const now = new Date().toISOString();
  const enabled = input.enabled ?? true;

  const payload = {
    owner_wallet: input.ownerWallet,
    percentage: input.percentage,
    pocket_id: input.pocketId,
    eligible_payment_type: input.eligiblePaymentType ?? "all_outgoing",
    enabled,
    paused_at: enabled ? null : existing?.paused_at ?? now,
    disabled_at: enabled ? null : now,
    updated_at: now,
  };

  if (existing) {
    const { data, error } = await supabase
      .from(spendSaveTable)
      .update(payload)
      .eq("owner_wallet", input.ownerWallet)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        readSavingsSupabaseError(error, "Could not update Spend&Save."),
      );
    }
    return data as SpendSaveConfigRecord;
  }

  const { data, error } = await supabase
    .from(spendSaveTable)
    .insert({
      ...payload,
      created_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not create Spend&Save."),
    );
  }

  trackSpendSavePercent("spend_save_enabled", input.percentage, {
    pocketId: input.pocketId,
  });

  return data as SpendSaveConfigRecord;
}

export async function setSpendSaveEnabled(
  ownerWallet: string,
  mode: "pause" | "resume" | "disable",
) {
  const existing = await getSpendSaveConfig(ownerWallet);
  if (!existing) {
    throw new Error("Spend&Save is not configured yet.");
  }

  const now = new Date().toISOString();
  const patch =
    mode === "pause"
      ? { enabled: false, paused_at: now, updated_at: now }
      : mode === "resume"
        ? {
            enabled: true,
            paused_at: null,
            disabled_at: null,
            updated_at: now,
          }
        : {
            enabled: false,
            disabled_at: now,
            paused_at: now,
            updated_at: now,
          };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(spendSaveTable)
    .update(patch)
    .eq("owner_wallet", ownerWallet)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not update Spend&Save status."),
    );
  }

  if (mode === "pause") {
    trackSwiftSaveEvent("spend_save_paused");
    const copy = copySpendSavePaused();
    await createSavingsNotification({
      ownerWallet,
      kind: "spend_save_paused",
      title: copy.title,
      body: copy.body,
    });
  } else if (mode === "resume") {
    trackSwiftSaveEvent("spend_save_enabled");
    const copy = copySpendSaveResumed();
    await createSavingsNotification({
      ownerWallet,
      kind: "spend_save_resumed",
      title: copy.title,
      body: copy.body,
    });
  } else {
    trackSwiftSaveEvent("spend_save_disabled");
    const copy = copySpendSaveDisabled();
    await createSavingsNotification({
      ownerWallet,
      kind: "spend_save_disabled",
      title: copy.title,
      body: copy.body,
    });
  }

  return data as SpendSaveConfigRecord;
}

/**
 * Active Spend&Save means enabled and not disabled.
 * Paused configs have enabled=false.
 */
export function isSpendSaveActive(config: SpendSaveConfigRecord | null) {
  return Boolean(config?.enabled);
}

export function computeSpendSaveQuote(input: {
  paymentAmountUnits: bigint;
  percentage: string | number;
  currency: ArcTokenSymbol;
  /** Optional fee legs shown to the user (default 0). */
  networkFeeUnits?: bigint;
  platformFeeUnits?: bigint;
  /** Pocket balance/target for hard-target capping. */
  currentBalanceUnits?: bigint;
  targetAmountUnits?: bigint | null;
  stopAtTarget?: boolean;
}) {
  const plannedSaveUnits = calculateSaveAmountUnits(
    input.paymentAmountUnits,
    input.percentage,
  );
  const cap = capSaveAmountForTarget({
    plannedSaveUnits,
    currentBalanceUnits: input.currentBalanceUnits ?? 0n,
    targetAmountUnits: input.targetAmountUnits ?? null,
    stopAtTarget: input.stopAtTarget === true,
  });
  const saveUnits = cap.cappedUnits;
  const networkFeeUnits = input.networkFeeUnits ?? 0n;
  const platformFeeUnits = input.platformFeeUnits ?? 0n;
  const total = totalRequiredUnits({
    paymentUnits: input.paymentAmountUnits,
    saveUnits,
    networkFeeUnits,
    platformFeeUnits,
  });
  const decimals = arcTestnetTokens[input.currency].decimals;
  const percentage =
    typeof input.percentage === "number"
      ? input.percentage.toFixed(2)
      : input.percentage;

  return {
    paymentAmountUnits: input.paymentAmountUnits.toString(),
    saveAmountUnits: saveUnits.toString(),
    plannedSaveAmountUnits: plannedSaveUnits.toString(),
    totalRequiredUnits: total.toString(),
    networkFeeUnits: networkFeeUnits.toString(),
    platformFeeUnits: platformFeeUnits.toString(),
    paymentAmount: formatUnitsToDecimal(input.paymentAmountUnits, decimals),
    saveAmount: formatUnitsToDecimal(saveUnits, decimals),
    plannedSaveAmount: formatUnitsToDecimal(plannedSaveUnits, decimals),
    networkFeeAmount: formatUnitsToDecimal(networkFeeUnits, decimals),
    platformFeeAmount: formatUnitsToDecimal(platformFeeUnits, decimals),
    totalRequired: formatUnitsToDecimal(total, decimals),
    percentage,
    targetCapped: cap.wasCapped,
    reachesTarget: cap.reachesTarget,
    roomToTargetUnits: cap.roomUnits?.toString() ?? null,
  };
}

export async function createSpendSaveEvent(input: {
  ownerWallet: string;
  config: SpendSaveConfigRecord;
  paymentAmount: string;
  paymentAmountUnits: string;
  saveAmount: string;
  saveAmountUnits: string;
  currency: ArcTokenSymbol;
  paymentId?: string | null;
  paymentTxHash?: string | null;
  savingsTransactionId?: string | null;
  status?: SpendSaveEventRecord["status"];
}) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const payload = {
    owner_wallet: input.ownerWallet,
    config_id: input.config.id,
    payment_id: input.paymentId ?? null,
    payment_tx_hash: input.paymentTxHash ?? null,
    pocket_id: input.config.pocket_id,
    payment_amount: input.paymentAmount,
    payment_amount_units: input.paymentAmountUnits,
    save_percentage: input.config.percentage,
    save_amount: input.saveAmount,
    save_amount_units: input.saveAmountUnits,
    currency: input.currency,
    status: input.status ?? "PENDING",
    savings_transaction_id: input.savingsTransactionId ?? null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(spendSaveEventsTable)
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not create Spend&Save event."),
    );
  }

  return data as SpendSaveEventRecord;
}

export async function updateSpendSaveEvent(
  eventId: string,
  ownerWallet: string,
  patch: Partial<{
    status: SpendSaveEventRecord["status"];
    payment_tx_hash: string | null;
    savings_transaction_id: string | null;
    failure_reason: string | null;
  }>,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(spendSaveEventsTable)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("owner_wallet", ownerWallet)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not update Spend&Save event."),
    );
  }

  return data as SpendSaveEventRecord;
}

export async function listSpendSaveEvents(
  ownerWallet: string,
  limit = 50,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(spendSaveEventsTable)
    .select("*")
    .eq("owner_wallet", ownerWallet)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));

  if (error) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not list Spend&Save history."),
    );
  }

  return (data ?? []) as SpendSaveEventRecord[];
}

/**
 * Server-side evaluation before a payment is allowed.
 * Returns null when Spend&Save should not apply.
 * Applies target-cap rules when pocket.stop_at_target is enabled.
 */
export async function evaluateSpendSaveForPayment(input: {
  ownerWallet: string;
  paymentAmountUnits: bigint;
  currency: ArcTokenSymbol;
  paymentKind?: string;
  networkFeeUnits?: bigint;
  platformFeeUnits?: bigint;
}) {
  if (
    !isEligibleOutgoingPayment({
      kind: input.paymentKind ?? "outgoing",
    })
  ) {
    return null;
  }

  const config = await getSpendSaveConfig(input.ownerWallet);
  if (!isSpendSaveActive(config) || !config) {
    return null;
  }

  const pocket = await getPocketForOwner(config.pocket_id, input.ownerWallet);
  if (!pocket || pocket.status !== "active") {
    // Auto-pause Spend&Save if destination pocket is gone/archived
    if (config.enabled) {
      try {
        await setSpendSaveEnabled(input.ownerWallet, "pause");
        const copy = copySpendSavePaused();
        await createSavingsNotification({
          ownerWallet: input.ownerWallet,
          kind: "spend_save_paused",
          title: copy.title,
          body: "Spend&Save was paused because the destination pocket is archived or missing.",
        });
      } catch {
        // best-effort
      }
    }
    return null;
  }

  if (pocket.currency !== input.currency) {
    // Only apply when payment currency matches pocket currency
    return null;
  }

  const targetUnits = pocket.target_amount_units
    ? unitsToBigInt(pocket.target_amount_units)
    : null;

  // Hard stop: already at target and stop_at_target on → no auto-save
  if (
    pocket.stop_at_target &&
    isTargetReached(unitsToBigInt(pocket.current_balance_units), targetUnits)
  ) {
    return null;
  }

  const quote = computeSpendSaveQuote({
    paymentAmountUnits: input.paymentAmountUnits,
    percentage: config.percentage,
    currency: input.currency,
    networkFeeUnits: input.networkFeeUnits,
    platformFeeUnits: input.platformFeeUnits,
    currentBalanceUnits: unitsToBigInt(pocket.current_balance_units),
    targetAmountUnits: targetUnits,
    stopAtTarget: Boolean(pocket.stop_at_target),
  });

  if (unitsToBigInt(quote.saveAmountUnits) <= 0n) {
    return null;
  }

  trackSpendSavePercent("spend_save_payment_triggered", config.percentage, {
    pocketId: pocket.id,
    currency: input.currency,
  });

  return {
    config,
    pocket,
    quote,
  };
}

/**
 * Create an explicit REVERSAL (or ADJUSTMENT) for a prior SPEND_SAVE / DEPOSIT
 * after a payment refund. Does not mutate the original completed record.
 */
export async function createSavingsReversal(input: {
  ownerWallet: string;
  originalTransactionId: string;
  idempotencyKey: string;
  reason?: string;
  mode?: "REVERSAL" | "ADJUSTMENT";
}) {
  const supabase = createSupabaseAdminClient();
  const existing = await supabase
    .from(transactionsTable)
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing.data) {
    return existing.data as SavingsTransactionRecord;
  }

  const originalLoad = await supabase
    .from(transactionsTable)
    .select("*")
    .eq("id", input.originalTransactionId)
    .eq("owner_wallet", input.ownerWallet)
    .single();

  if (originalLoad.error || !originalLoad.data) {
    throw new Error("Original savings transaction not found.");
  }

  const original = originalLoad.data as SavingsTransactionRecord;
  if (original.status !== "COMPLETED") {
    throw new Error("Only completed savings transactions can be reversed.");
  }
  if (
    original.type !== "SPEND_SAVE" &&
    original.type !== "DEPOSIT" &&
    original.type !== "ADJUSTMENT"
  ) {
    throw new Error("This transaction type cannot be reversed.");
  }

  // Prevent double reverse of same original
  const priorReverse = await supabase
    .from(transactionsTable)
    .select("id")
    .eq("related_savings_transaction_id", original.id)
    .in("type", ["REVERSAL", "ADJUSTMENT"])
    .eq("status", "COMPLETED")
    .maybeSingle();

  if (priorReverse.data) {
    throw new Error("This savings transaction was already reversed.");
  }

  const pocket = await getPocketForOwner(original.pocket_id, input.ownerWallet);
  if (!pocket) {
    throw new Error("Savings pocket not found.");
  }

  const amountUnits = unitsToBigInt(original.amount_units);
  const balance = unitsToBigInt(pocket.current_balance_units);
  if (amountUnits > balance) {
    throw new Error(
      "Cannot reverse more than the current pocket balance. Mark for reconciliation.",
    );
  }

  const mode = input.mode ?? "REVERSAL";
  const now = new Date().toISOString();

  // Ledger-only reverse first (requires later on-chain withdraw if vault holds funds)
  const inserted = await supabase
    .from(transactionsTable)
    .insert({
      owner_wallet: input.ownerWallet,
      pocket_id: original.pocket_id,
      type: mode,
      amount: original.amount,
      amount_units: original.amount_units,
      currency: original.currency,
      status: "PENDING",
      related_payment_id: original.related_payment_id,
      related_payment_tx_hash: original.related_payment_tx_hash,
      related_savings_transaction_id: original.id,
      idempotency_key: input.idempotencyKey,
      metadata: {
        reason: input.reason ?? "payment_refund",
        original_type: original.type,
        requires_on_chain_withdraw: true,
      },
    })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    if (inserted.error?.message?.toLowerCase().includes("duplicate")) {
      const again = await supabase
        .from(transactionsTable)
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .single();
      if (again.data) return again.data as SavingsTransactionRecord;
    }
    throw new Error(
      readSavingsSupabaseError(
        inserted.error,
        "Could not create savings reversal.",
      ),
    );
  }

  // Note: confirmation still requires on-chain withdraw + confirmSavingsTransaction
  // with direction withdraw. Return pending reversal for the client/worker.
  void now;
  return inserted.data as SavingsTransactionRecord;
}

/**
 * Background reconciliation: inspect pending/submitted txs and open alerts.
 * No Redis/BullMQ in this repo — invoked via Vercel cron.
 */
export async function reconcilePendingSavingsTransactions(limit = 40) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(transactionsTable)
    .select("*")
    .in("status", [
      "PENDING",
      "PROCESSING",
      "SAVINGS_SUBMITTED",
      "PAYMENT_SUBMITTED",
      "PAYMENT_CONFIRMED",
      "REQUIRES_RECONCILIATION",
    ])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(
      readSavingsSupabaseError(error, "Could not load pending savings txs."),
    );
  }

  const rows = (data ?? []) as SavingsTransactionRecord[];
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });

  let confirmed = 0;
  let failed = 0;
  let alerts = 0;
  let skipped = 0;

  for (const tx of rows) {
    try {
      if (!tx.tx_hash) {
        // Stale pending without hash after 30 minutes → alert
        const age = Date.now() - new Date(tx.created_at).getTime();
        if (age > 30 * 60 * 1000 && tx.status === "PENDING") {
          await createReconciliationAlert({
            ownerWallet: tx.owner_wallet,
            transactionId: tx.id,
            pocketId: tx.pocket_id,
            alertType: "stale_pending",
            message: "Savings transaction pending without tx hash for >30m.",
          });
          alerts += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const receipt = await publicClient.getTransactionReceipt({
        hash: tx.tx_hash as Hash,
      });

      if (!receipt) {
        skipped += 1;
        continue;
      }

      if (receipt.status === "reverted") {
        await supabase
          .from(transactionsTable)
          .update({
            status: "FAILED",
            failure_reason: "On-chain transaction reverted (reconciler).",
            failed_at: new Date().toISOString(),
          })
          .eq("id", tx.id)
          .neq("status", "COMPLETED");
        failed += 1;
        await createReconciliationAlert({
          ownerWallet: tx.owner_wallet,
          transactionId: tx.id,
          pocketId: tx.pocket_id,
          alertType: "tx_reverted",
          message: "On-chain savings transaction reverted.",
        });
        alerts += 1;
        continue;
      }

      if (receipt.status === "success" && tx.status !== "COMPLETED") {
        const direction =
          tx.type === "WITHDRAWAL" ||
          tx.type === "REVERSAL" ||
          tx.type === "REFUND"
            ? "withdraw"
            : "deposit";
        try {
          await confirmSavingsTransaction({
            transactionId: tx.id,
            ownerWallet: tx.owner_wallet,
            txHash: tx.tx_hash as Hash,
            direction,
          });
          confirmed += 1;
        } catch (err) {
          await createReconciliationAlert({
            ownerWallet: tx.owner_wallet,
            transactionId: tx.id,
            pocketId: tx.pocket_id,
            alertType: "confirm_failed",
            message:
              err instanceof Error
                ? err.message
                : "Reconciler could not confirm transaction.",
          });
          alerts += 1;
        }
      }
    } catch {
      skipped += 1;
    }
  }

  return {
    scanned: rows.length,
    confirmed,
    failed,
    alerts,
    skipped,
  };
}
