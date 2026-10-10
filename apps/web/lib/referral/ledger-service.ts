import { referralDb, referralTables, readReferralDbError } from "@/lib/referral/db";
import type {
  OnePointsAccountRecord,
  OnePointsEntryType,
  OnePointsLedgerEntryRecord,
} from "@/lib/referral/types";
import {
  ONE_POINTS_UNITS_PER_POINT,
  ONE_POINTS_USD_PER_POINT,
} from "@/lib/referral/types";

/**
 * Convert OnePoints display amount (e.g. 20, 0.3) to integer internal units.
 * Uses string arithmetic to avoid IEEE 754 floating point inaccuracies.
 */
export function pointsToInternalUnits(points: number | string): bigint {
  const str = typeof points === "number" ? points.toFixed(2) : points.trim();
  // The sign applies to the whole amount. Splitting "-0.20" naively gives
  // whole "-0" (= 0) plus fraction 20, turning a 0.2 debit into a credit.
  const negative = str.startsWith("-");
  const magnitude = negative || str.startsWith("+") ? str.slice(1) : str;
  const [whole, fraction = ""] = magnitude.split(".");
  const paddedFrac = (fraction + "00").slice(0, 2);
  const units = BigInt(whole || "0") * ONE_POINTS_UNITS_PER_POINT + BigInt(paddedFrac);
  return negative ? -units : units;
}

/**
 * Convert internal integer units to human-readable OnePoints.
 */
export function internalUnitsToPoints(units: bigint | number | string): number {
  const b = BigInt(units);
  return Number(b) / Number(ONE_POINTS_UNITS_PER_POINT);
}

/**
 * Convert internal integer units to USDC equivalent amount.
 * 1 ONE Point = 0.01 USDC -> 100 internal units = 0.01 USDC -> 1 unit = 0.0001 USDC
 */
export function internalUnitsToUsdc(units: bigint | number | string): number {
  const pts = internalUnitsToPoints(units);
  return Number((pts * ONE_POINTS_USD_PER_POINT).toFixed(4));
}

/**
 * Ensure a OnePoints account exists for a wallet.
 */
export async function getOrCreateOnePointsAccount(
  walletAddress: string,
): Promise<OnePointsAccountRecord> {
  const wallet = walletAddress.toLowerCase();
  const supabase = referralDb();

  const existing = await supabase
    .from(referralTables.accounts)
    .select("*")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (existing.error) {
    throw new Error(readReferralDbError(existing.error, "Could not load OnePoints account."));
  }

  if (existing.data) {
    return existing.data as OnePointsAccountRecord;
  }

  const created = await supabase
    .from(referralTables.accounts)
    .insert({
      wallet_address: wallet,
      available_balance_units: 0,
      pending_balance_units: 0,
      lifetime_earned_units: 0,
      lifetime_redeemed_units: 0,
    })
    .select("*")
    .single();

  if (created.error) {
    if (created.error.code === "23505") {
      const retry = await supabase
        .from(referralTables.accounts)
        .select("*")
        .eq("wallet_address", wallet)
        .single();
      if (retry.data) return retry.data as OnePointsAccountRecord;
    }
    throw new Error(readReferralDbError(created.error, "Could not initialize OnePoints account."));
  }

  return created.data as OnePointsAccountRecord;
}

/**
 * Record an immutable ledger entry and atomically update the account balance.
 * Strictly enforces idempotency via unique idempotency_key.
 */
export async function recordLedgerEntry(input: {
  walletAddress: string;
  entryType: OnePointsEntryType;
  points: number | string;
  idempotencyKey: string;
  description: string;
  referralId?: string | null;
  transactionId?: string | null;
  campaignId?: string | null;
  originalLedgerEntryId?: string | null;
  metadata?: Record<string, unknown>;
  policyVersion?: string;
  createdBy?: string;
}): Promise<{
  entry: OnePointsLedgerEntryRecord;
  account: OnePointsAccountRecord;
  alreadyProcessed: boolean;
}> {
  const wallet = input.walletAddress.toLowerCase();
  const supabase = referralDb();

  // 1. Check idempotency
  const existingEntry = await supabase
    .from(referralTables.ledger)
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existingEntry.error) {
    throw new Error(readReferralDbError(existingEntry.error, "Failed checking idempotency."));
  }

  if (existingEntry.data) {
    const account = await getOrCreateOnePointsAccount(wallet);
    return {
      entry: existingEntry.data as OnePointsLedgerEntryRecord,
      account,
      alreadyProcessed: true,
    };
  }

  // 2. Fetch or create account
  const account = await getOrCreateOnePointsAccount(wallet);

  const deltaUnits = pointsToInternalUnits(input.points);
  const isDebit = deltaUnits < 0n;
  const currentAvailableUnits = BigInt(account.available_balance_units);

  if (isDebit && currentAvailableUnits + deltaUnits < 0n) {
    throw new Error("Insufficient ONE Points balance.");
  }

  const displayAmount = internalUnitsToPoints(deltaUnits);
  const usdcEquivalent = internalUnitsToUsdc(deltaUnits);

  // 3. Insert ledger entry
  const entryInsert = await supabase
    .from(referralTables.ledger)
    .insert({
      account_id: account.id,
      wallet_address: wallet,
      entry_type: input.entryType,
      amount_units: Number(deltaUnits),
      display_amount: displayAmount,
      usdc_equivalent: usdcEquivalent,
      status: "COMPLETED",
      idempotency_key: input.idempotencyKey,
      referral_id: input.referralId ?? null,
      transaction_id: input.transactionId ?? null,
      campaign_id: input.campaignId ?? null,
      original_ledger_entry_id: input.originalLedgerEntryId ?? null,
      description: input.description,
      metadata: input.metadata ?? {},
      policy_version: input.policyVersion ?? "1.0",
      created_by: input.createdBy ?? "system",
    })
    .select("*")
    .single();

  if (entryInsert.error) {
    if (entryInsert.error.code === "23505") {
      const duplicate = await supabase
        .from(referralTables.ledger)
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .single();
      return {
        entry: duplicate.data as OnePointsLedgerEntryRecord,
        account,
        alreadyProcessed: true,
      };
    }
    throw new Error(readReferralDbError(entryInsert.error, "Could not record ledger entry."));
  }

  // 4. Update account balances atomically
  const nextAvailableUnits = currentAvailableUnits + deltaUnits;
  const nextLifetimeEarned = isDebit
    ? BigInt(account.lifetime_earned_units)
    : BigInt(account.lifetime_earned_units) + deltaUnits;
  const nextLifetimeRedeemed = isDebit
    ? BigInt(account.lifetime_redeemed_units) + -deltaUnits
    : BigInt(account.lifetime_redeemed_units);

  const accountUpdate = await supabase
    .from(referralTables.accounts)
    .update({
      available_balance_units: Number(nextAvailableUnits),
      lifetime_earned_units: Number(nextLifetimeEarned),
      lifetime_redeemed_units: Number(nextLifetimeRedeemed),
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .select("*")
    .single();

  if (accountUpdate.error) {
    throw new Error(readReferralDbError(accountUpdate.error, "Could not update OnePoints account."));
  }

  return {
    entry: entryInsert.data as OnePointsLedgerEntryRecord,
    account: accountUpdate.data as OnePointsAccountRecord,
    alreadyProcessed: false,
  };
}

/**
 * Get account points breakdown.
 */
export async function getOnePointsSummary(walletAddress: string) {
  const account = await getOrCreateOnePointsAccount(walletAddress);
  const availableUnits = BigInt(account.available_balance_units);
  const pendingUnits = BigInt(account.pending_balance_units);
  const lifetimeEarnedUnits = BigInt(account.lifetime_earned_units);
  const lifetimeRedeemedUnits = BigInt(account.lifetime_redeemed_units);

  return {
    available: internalUnitsToPoints(availableUnits),
    pending: internalUnitsToPoints(pendingUnits),
    lifetimeEarned: internalUnitsToPoints(lifetimeEarnedUnits),
    redeemed: internalUnitsToPoints(lifetimeRedeemedUnits),
    usdcEquivalent: internalUnitsToUsdc(availableUnits),
  };
}

/**
 * List ledger history for a wallet.
 */
export async function listOnePointsLedger(walletAddress: string, limit = 50) {
  const wallet = walletAddress.toLowerCase();
  const supabase = referralDb();

  const { data, error } = await supabase
    .from(referralTables.ledger)
    .select("*")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(readReferralDbError(error, "Could not list points ledger entries."));
  }

  return (data ?? []) as OnePointsLedgerEntryRecord[];
}
