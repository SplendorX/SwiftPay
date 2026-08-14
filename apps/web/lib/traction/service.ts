import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AnyRecord = Record<string, unknown>;

export type TractionEventRecord = {
  amount?: string;
  chainId?: number;
  circleSocialUuid?: string;
  currency?: string;
  eventType: string;
  metadata?: AnyRecord;
  pathname?: string;
  referrer?: string;
  sessionId?: string;
  source?: string;
  txHash?: string;
  userAgent?: string;
  walletAddress?: string | null;
};

export type TractionSummary = {
  actuals: {
    activeWallets30d: number;
    earnAum: number;
    monthlyStablecoinVolume: number;
    monthlyTransactions: number;
    paymentSubmissionSuccessRate: number | null;
    recurringSchedules: number;
    registeredWallets: number;
    savingsAum: number;
    totalTrackedEvents30d: number;
  };
  byCurrency: Record<
    string,
    {
      earnAum: number;
      paymentVolume: number;
      savingsAum: number;
      swapVolume: number;
    }
  >;
  dataHealth: {
    configured: boolean;
    missingTables: string[];
    notes: string[];
  };
  eventCounts: Record<string, number>;
  generatedAt: string;
  lastEvents: Array<{
    amount: number;
    currency: string;
    eventType: string;
    occurredAt: string;
    source: string;
    txHash: string;
    walletAddress: string;
  }>;
  rangeDays: number;
};

const tractionTable =
  process.env.SUPABASE_TRACTION_EVENTS_TABLE ?? "traction_events";
const savingsTransactionsTable =
  process.env.SUPABASE_SAVINGS_TRANSACTIONS_TABLE ?? "savings_transactions";
const earnDepositsTable =
  process.env.SUPABASE_EARN_DEPOSITS_TABLE ?? "earn_deposits";
const earnWithdrawalsTable =
  process.env.SUPABASE_EARN_WITHDRAWALS_TABLE ?? "earn_withdrawals";
const recurringSchedulesTable =
  process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";
const profilesTable = process.env.SUPABASE_PROFILES_TABLE ?? "profiles";

let cachedSupabase: SupabaseClient | null = null;

function getSupabaseUrl() {
  return (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ??
    ""
  ).trim();
}

function getSupabaseServiceKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    ""
  ).trim();
}

export function isTractionStorageConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceKey());
}

function getSupabase() {
  if (!cachedSupabase) {
    const url = getSupabaseUrl();
    const key = getSupabaseServiceKey();

    if (!url || !key) {
      throw new Error(
        "Supabase service credentials are required for traction tracking.",
      );
    }

    cachedSupabase = createClient(url, key, {
      auth: {
        persistSession: false,
      },
    });
  }

  return cachedSupabase;
}

function normalizeWallet(value: unknown) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function normalizeString(value: unknown, maxLength = 120) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength) || null
    : null;
}

function normalizeCurrency(value: unknown) {
  const currency = normalizeString(value, 20)?.toUpperCase();
  return currency && /^[A-Z0-9_:-]+$/.test(currency) ? currency : null;
}

function normalizeAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.max(0, value));
  }

  if (typeof value !== "string") {
    return null;
  }

  const compact = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,18})?$/.test(compact)) {
    return null;
  }

  return compact;
}

function normalizeEventType(value: unknown) {
  const eventType = normalizeString(value, 80);
  if (!eventType || !/^[a-zA-Z0-9_.:-]+$/.test(eventType)) {
    return null;
  }

  return eventType.toLowerCase();
}

function metadataIsRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactMetadata(value: unknown) {
  if (!metadataIsRecord(value)) {
    return {};
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .slice(0, 40);

  return Object.fromEntries(entries);
}

export async function recordTractionEvent(input: TractionEventRecord) {
  const eventType = normalizeEventType(input.eventType);
  if (!eventType) {
    throw new Error("A valid traction event type is required.");
  }

  const wallet = normalizeWallet(input.walletAddress);
  const sessionId = normalizeString(input.sessionId, 128);
  const circleSocialUuid = normalizeString(input.circleSocialUuid, 128);

  const row = {
    amount_numeric: normalizeAmount(input.amount),
    chain_id:
      typeof input.chainId === "number" && Number.isFinite(input.chainId)
        ? Math.trunc(input.chainId)
        : null,
    circle_social_uuid: circleSocialUuid,
    currency: normalizeCurrency(input.currency),
    event_type: eventType,
    metadata: compactMetadata({
      ...input.metadata,
      pathname: normalizeString(input.pathname, 240),
    }),
    referrer: normalizeString(input.referrer, 500),
    session_id: sessionId,
    source: normalizeString(input.source, 80),
    tx_hash: normalizeString(input.txHash, 90)?.toLowerCase(),
    user_agent: normalizeString(input.userAgent, 500),
    wallet_address: wallet,
  };

  if (!wallet && !sessionId && !circleSocialUuid) {
    throw new Error("Traction event requires a wallet, session, or Circle user.");
  }

  const { error } = await getSupabase().from(tractionTable).insert(row);
  if (error) {
    throw new Error(`Could not record traction event: ${error.message}`);
  }
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function pickAmount(row: AnyRecord) {
  for (const key of [
    "amount_numeric",
    "amount",
    "amount_units",
    "assets",
    "assets_units",
    "value",
    "total_amount",
  ]) {
    const value = row[key];
    const parsed = toNumber(value);

    if (parsed > 0) {
      const decimals = key.endsWith("_units") ? pickDecimals(row) : 0;
      return decimals > 0 ? parsed / 10 ** decimals : parsed;
    }
  }

  return 0;
}

function pickDecimals(row: AnyRecord) {
  const raw = row.decimals ?? row.token_decimals ?? row.currency_decimals;
  const parsed = toNumber(raw);
  return parsed > 0 && parsed <= 18 ? parsed : 6;
}

function pickCurrency(row: AnyRecord) {
  return (
    normalizeCurrency(row.currency) ??
    normalizeCurrency(row.token_symbol) ??
    normalizeCurrency(row.symbol) ??
    normalizeCurrency(row.asset_symbol) ??
    "USDC"
  );
}

function pickWallet(row: AnyRecord) {
  return (
    normalizeWallet(row.wallet_address) ??
    normalizeWallet(row.owner_wallet) ??
    normalizeWallet(row.wallet) ??
    normalizeWallet(row.address)
  );
}

function pickTxHash(row: AnyRecord) {
  return normalizeString(row.tx_hash ?? row.transaction_hash ?? row.hash, 90);
}

function pickOccurredAt(row: AnyRecord) {
  return (
    normalizeString(row.occurred_at, 40) ??
    normalizeString(row.created_at, 40) ??
    normalizeString(row.updated_at, 40) ??
    ""
  );
}

function addCurrencyMetric(
  metrics: TractionSummary["byCurrency"],
  currency: string,
  key: keyof TractionSummary["byCurrency"][string],
  amount: number,
) {
  metrics[currency] ??= {
    earnAum: 0,
    paymentVolume: 0,
    savingsAum: 0,
    swapVolume: 0,
  };
  metrics[currency][key] += amount;
}

async function selectRows(
  table: string,
  options: { limit?: number; since?: string } = {},
) {
  try {
    let query: any = getSupabase()
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 10_000);

    if (options.since) {
      query = query.gte("created_at", options.since);
    }

    const { data, error } = await query;

    if (error) {
      return {
        error: error.message,
        rows: [] as AnyRecord[],
      };
    }

    return {
      error: null,
      rows: (data ?? []) as AnyRecord[],
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      rows: [] as AnyRecord[],
    };
  }
}

async function countRows(table: string) {
  try {
    const { count, error } = await getSupabase()
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      return {
        count: 0,
        error: error.message,
      };
    }

    return {
      count: count ?? 0,
      error: null,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function actorId(row: AnyRecord) {
  return (
    normalizeWallet(row.wallet_address) ??
    normalizeWallet(row.owner_wallet) ??
    normalizeString(row.circle_social_uuid, 128) ??
    normalizeString(row.session_id, 128)
  );
}

function isCompletedSavingsRow(row: AnyRecord) {
  const status = normalizeString(row.status, 40)?.toUpperCase();
  return !status || ["COMPLETED", "CONFIRMED", "SUCCESS", "SETTLED"].includes(status);
}

function isSavingsDeposit(row: AnyRecord) {
  const type = normalizeString(row.type ?? row.direction, 60)?.toUpperCase();
  return Boolean(type?.includes("DEPOSIT") || type?.includes("SPEND_SAVE"));
}

function isSavingsWithdraw(row: AnyRecord) {
  const type = normalizeString(row.type ?? row.direction, 60)?.toUpperCase();
  return Boolean(
    type?.includes("WITHDRAW") ||
      type?.includes("REVERSAL") ||
      type?.includes("REFUND"),
  );
}

export async function getTractionSummary(rangeDays = 30): Promise<TractionSummary> {
  const generatedAt = new Date().toISOString();
  const since = new Date(
    Date.now() - Math.max(1, Math.min(rangeDays, 365)) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const missingTables: string[] = [];
  const notes: string[] = [];
  const byCurrency: TractionSummary["byCurrency"] = {};
  const eventCounts: Record<string, number> = {};
  const activeActors = new Set<string>();
  const registeredWallets = new Set<string>();
  const transactionKeys = new Set<string>();
  const submittedPaymentKeys = new Set<string>();
  const failedPaymentKeys = new Set<string>();

  if (!isTractionStorageConfigured()) {
    return {
      actuals: {
        activeWallets30d: 0,
        earnAum: 0,
        monthlyStablecoinVolume: 0,
        monthlyTransactions: 0,
        paymentSubmissionSuccessRate: null,
        recurringSchedules: 0,
        registeredWallets: 0,
        savingsAum: 0,
        totalTrackedEvents30d: 0,
      },
      byCurrency,
      dataHealth: {
        configured: false,
        missingTables,
        notes: ["Set Supabase service credentials to enable traction tracking."],
      },
      eventCounts,
      generatedAt,
      lastEvents: [],
      rangeDays,
    };
  }

  const [
    traction,
    profiles,
    savingsRows,
    earnDeposits,
    earnWithdrawals,
    recurringCount,
  ] = await Promise.all([
    selectRows(tractionTable, { since }),
    selectRows(profilesTable),
    selectRows(savingsTransactionsTable),
    selectRows(earnDepositsTable),
    selectRows(earnWithdrawalsTable),
    countRows(recurringSchedulesTable),
  ]);

  for (const [table, result] of [
    [tractionTable, traction],
    [profilesTable, profiles],
    [savingsTransactionsTable, savingsRows],
    [earnDepositsTable, earnDeposits],
    [earnWithdrawalsTable, earnWithdrawals],
  ] as const) {
    if (result.error) {
      missingTables.push(table);
      notes.push(`${table}: ${result.error}`);
    }
  }

  if (recurringCount.error) {
    missingTables.push(recurringSchedulesTable);
    notes.push(`${recurringSchedulesTable}: ${recurringCount.error}`);
  }

  for (const row of profiles.rows) {
    const wallet = pickWallet(row);
    if (wallet) {
      registeredWallets.add(wallet);
    }
  }

  for (const row of traction.rows) {
    const eventType = normalizeString(row.event_type, 80) ?? "unknown";
    const amount = pickAmount(row);
    const currency = pickCurrency(row);
    const txHash = pickTxHash(row);
    const eventKey = txHash ?? `${eventType}:${row.id ?? Math.random()}`;
    const actor = actorId(row);
    const wallet = pickWallet(row);

    eventCounts[eventType] = (eventCounts[eventType] ?? 0) + 1;

    if (actor) {
      activeActors.add(actor);
    }
    if (wallet) {
      registeredWallets.add(wallet);
    }

    if (eventType.includes("payment_submitted")) {
      submittedPaymentKeys.add(eventKey);
      transactionKeys.add(eventKey);
      addCurrencyMetric(byCurrency, currency, "paymentVolume", amount);
    } else if (eventType.includes("payment_failed")) {
      failedPaymentKeys.add(eventKey);
    } else if (eventType.includes("swap_submitted")) {
      transactionKeys.add(eventKey);
      addCurrencyMetric(byCurrency, currency, "swapVolume", amount);
    } else if (eventType.includes("earn_deposit")) {
      addCurrencyMetric(byCurrency, currency, "earnAum", amount);
    } else if (eventType.includes("earn_withdraw")) {
      addCurrencyMetric(byCurrency, currency, "earnAum", -amount);
    } else if (eventType.includes("savings_deposit")) {
      addCurrencyMetric(byCurrency, currency, "savingsAum", amount);
    } else if (eventType.includes("savings_withdraw")) {
      addCurrencyMetric(byCurrency, currency, "savingsAum", -amount);
    }
  }

  for (const row of savingsRows.rows) {
    if (!isCompletedSavingsRow(row)) {
      continue;
    }

    const amount = pickAmount(row);
    const currency = pickCurrency(row);
    const wallet = pickWallet(row);

    if (wallet) {
      registeredWallets.add(wallet);
    }

    if (isSavingsDeposit(row)) {
      addCurrencyMetric(byCurrency, currency, "savingsAum", amount);
    } else if (isSavingsWithdraw(row)) {
      addCurrencyMetric(byCurrency, currency, "savingsAum", -amount);
    }
  }

  for (const row of earnDeposits.rows) {
    if (!isCompletedSavingsRow(row)) {
      continue;
    }

    const wallet = pickWallet(row);
    if (wallet) {
      registeredWallets.add(wallet);
    }

    addCurrencyMetric(byCurrency, pickCurrency(row), "earnAum", pickAmount(row));
  }

  for (const row of earnWithdrawals.rows) {
    if (!isCompletedSavingsRow(row)) {
      continue;
    }

    addCurrencyMetric(
      byCurrency,
      pickCurrency(row),
      "earnAum",
      -pickAmount(row),
    );
  }

  const totals = Object.values(byCurrency).reduce(
    (total, entry) => ({
      earnAum: total.earnAum + Math.max(0, entry.earnAum),
      paymentVolume: total.paymentVolume + entry.paymentVolume,
      savingsAum: total.savingsAum + Math.max(0, entry.savingsAum),
      swapVolume: total.swapVolume + entry.swapVolume,
    }),
    {
      earnAum: 0,
      paymentVolume: 0,
      savingsAum: 0,
      swapVolume: 0,
    },
  );
  const paymentAttempts = submittedPaymentKeys.size + failedPaymentKeys.size;
  const paymentSubmissionSuccessRate =
    paymentAttempts > 0 ? submittedPaymentKeys.size / paymentAttempts : null;

  return {
    actuals: {
      activeWallets30d: activeActors.size,
      earnAum: Number(totals.earnAum.toFixed(2)),
      monthlyStablecoinVolume: Number(
        (totals.paymentVolume + totals.swapVolume).toFixed(2),
      ),
      monthlyTransactions: transactionKeys.size,
      paymentSubmissionSuccessRate,
      recurringSchedules: recurringCount.count,
      registeredWallets: registeredWallets.size,
      savingsAum: Number(totals.savingsAum.toFixed(2)),
      totalTrackedEvents30d: traction.rows.length,
    },
    byCurrency,
    dataHealth: {
      configured: true,
      missingTables: [...new Set(missingTables)],
      notes,
    },
    eventCounts,
    generatedAt,
    lastEvents: traction.rows.slice(0, 20).map((row) => ({
      amount: pickAmount(row),
      currency: pickCurrency(row),
      eventType: normalizeString(row.event_type, 80) ?? "unknown",
      occurredAt: pickOccurredAt(row),
      source: normalizeString(row.source, 80) ?? "app",
      txHash: pickTxHash(row) ?? "",
      walletAddress: pickWallet(row) ?? "",
    })),
    rangeDays,
  };
}
