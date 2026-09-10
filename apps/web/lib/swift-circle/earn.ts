import { writeCircleActivity } from "@/lib/swift-circle/activity";
import { circleTreasuryAddress } from "@/lib/swift-circle/adapter";
import { writeCircleAudit } from "@/lib/swift-circle/audit";
import {
  assertCircleActive,
  assertNotFrozen,
  loadCircle,
  requireActiveMember,
} from "@/lib/swift-circle/auth";
import { postFinancialCard } from "@/lib/swift-circle/chat";
import { circleDb, circleTables, isDuplicateError, readCircleDbError } from "@/lib/swift-circle/db";
import { circleErrors } from "@/lib/swift-circle/errors";
import {
  confirmLedgerEntry,
  sumConfirmedUnits,
  writeLedgerEntry,
} from "@/lib/swift-circle/ledger";
import { loadPlatformLimits, assertUnderLimit } from "@/lib/swift-circle/limits";
import { parseAmountUnits, parseUnits, unitsToAmount } from "@/lib/swift-circle/money";
import { notifyMany } from "@/lib/swift-circle/notifications";
import {
  attachContributionTx,
  findContributionByTxHash,
  listSubmittedDeposits,
  logDeposit,
  markContributionFailed,
  normalizeTxHash,
  requireTreasuryOrThrow,
  txHashAlreadyConfirmed,
  verifyContributionRow,
} from "@/lib/swift-circle/deposits";
import { consumeCircleRateLimit } from "@/lib/swift-circle/rate-limit";
import { assertPermission } from "@/lib/swift-circle/rbac";
import { listActiveMemberWallets } from "@/lib/swift-circle/service";
import type {
  CircleEarnAccountRecord,
  CircleEarnContributionRecord,
} from "@/lib/swift-circle/types";

export type CircleEarnProvider = {
  id: string;
  getYieldInfo(): Promise<Record<string, unknown>>;
};

class LedgerEarnProvider implements CircleEarnProvider {
  id = "ledger";
  async getYieldInfo() {
    return {};
  }
}

function getEarnProvider(id?: string | null): CircleEarnProvider {
  return new LedgerEarnProvider();
}

function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 128) return null;
  return key;
}

export async function getEarnAccount(circleId: string) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.earnAccounts)
    .select("*")
    .eq("circle_id", circleId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load Circle Earn."));
  }
  if (!data) throw circleErrors.notFound("Circle Earn");
  return data as CircleEarnAccountRecord;
}

export async function getEarnOverview(circleId: string) {
  await settleSubmittedEarnContributions(circleId);
  const account = await getEarnAccount(circleId);
  const provider = getEarnProvider(account.provider);
  const yieldInfo = await provider.getYieldInfo();
  const supabase = circleDb();
  const { data: contributions, error } = await supabase
    .from(circleTables.earnContributions)
    .select("*")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load contributions."));
  }
  const principal = parseUnits(account.principal_units);
  const current = parseUnits(account.current_value_units);
  const earned = current > principal ? current - principal : 0n;
  return {
    account: {
      ...account,
      yield_info: Object.keys(yieldInfo).length ? yieldInfo : account.yield_info,
    },
    treasuryAddress: circleTreasuryAddress(),
    earned: unitsToAmount(earned, "USDC"),
    earned_units: earned.toString(),
    contributions: (contributions ?? []) as CircleEarnContributionRecord[],
    provider: provider.id,
  };
}

export async function proposeEarnContribution(input: {
  actorWallet: string;
  circleId: string;
  amount: unknown;
  idempotencyKey?: unknown;
  requestId?: string;
}) {
  consumeCircleRateLimit({ bucket: "EARN", wallet: input.actorWallet });
  const circle = await loadCircle(input.circleId);
  assertCircleActive(circle);
  assertNotFrozen(circle);
  const member = await requireActiveMember(input.circleId, input.actorWallet);
  assertPermission(member, "contribute_earn");
  const parsed = parseAmountUnits(input.amount, circle.currency);
  if (!parsed) throw circleErrors.invalid("Enter a valid contribution amount.");
  const limits = await loadPlatformLimits();
  assertUnderLimit(parsed.units, limits.max_earn_contribution_units, "Contribution");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) {
    throw circleErrors.invalid("An idempotency key is required.");
  }
  const treasury = requireTreasuryOrThrow("Earn");
  const account = await getEarnAccount(circle.id);
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.earnContributions)
    .insert({
      circle_earn_account_id: account.id,
      circle_id: circle.id,
      user_wallet: input.actorWallet,
      amount: parsed.amount,
      amount_units: parsed.amount_units,
      asset: circle.currency,
      status: "proposed",
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();
  if (error && isDuplicateError(error)) {
    const { data: existing } = await supabase
      .from(circleTables.earnContributions)
      .select("*")
      .eq("user_wallet", input.actorWallet)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    return {
      contribution: existing as CircleEarnContributionRecord,
      reused: true,
      treasuryAddress: treasury,
    };
  }
  if (error) {
    throw new Error(readCircleDbError(error, "Could not create contribution."));
  }
  await writeLedgerEntry({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    entryType: "contribution",
    productType: "earn",
    source: input.actorWallet,
    destination: `circle_earn:${account.id}`,
    amountUnits: parsed.amount_units,
    asset: circle.currency,
    purpose: "circle_earn_contribution",
    relatedEntityType: "earn_contribution",
    relatedEntityId: data.id,
    status: "pending",
    idempotencyKey: `earn:${idempotencyKey}`,
  });
  await writeCircleAudit({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    action: "EARN_CONTRIBUTION",
    entityType: "earn_contribution",
    entityId: data.id,
    requestId: input.requestId,
  });
  return {
    contribution: data as CircleEarnContributionRecord,
    reused: false,
    treasuryAddress: treasury,
  };
}

export async function submitEarnContribution(input: {
  actorWallet: string;
  contributionId: string;
  txHash?: unknown;
  transactionId?: unknown;
}) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.earnContributions)
    .select("*")
    .eq("id", input.contributionId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load contribution."));
  }
  if (!data) throw circleErrors.notFound("Contribution");
  const row = data as CircleEarnContributionRecord;
  if (row.user_wallet !== input.actorWallet) throw circleErrors.forbidden();
  if (row.status === "confirmed") return row;
  if (row.status === "failed" || row.status === "cancelled") {
    throw circleErrors.conflict("This contribution can no longer be submitted.");
  }
  const txHash = normalizeTxHash(input.txHash) ?? normalizeTxHash(row.tx_hash);
  const transactionId =
    typeof input.transactionId === "string" && input.transactionId.trim()
      ? input.transactionId.trim()
      : row.transaction_id;
  const { data: updated, error: updateError } = await supabase
    .from(circleTables.earnContributions)
    .update({
      status: "submitted",
      tx_hash: txHash,
      transaction_id: transactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .in("status", ["proposed", "submitted"])
    .select("*")
    .maybeSingle();
  if (updateError) {
    throw new Error(readCircleDbError(updateError, "Could not submit contribution."));
  }
  const submitted = (updated ?? row) as CircleEarnContributionRecord;
  if (!submitted.tx_hash) return submitted;
  const confirmed = await confirmEarnContributionFromTx(submitted.tx_hash, {
    waitMs: 12_000,
    strict: true,
  });
  return confirmed ?? submitted;
}

export async function confirmEarnContributionById(input: {
  actorWallet: string;
  contributionId: string;
  txHash?: unknown;
  transactionId?: unknown;
}) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.earnContributions)
    .select("*")
    .eq("id", input.contributionId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load contribution."));
  }
  if (!data) throw circleErrors.notFound("Contribution");
  const row = data as CircleEarnContributionRecord;
  if (row.user_wallet !== input.actorWallet) throw circleErrors.forbidden();
  if (row.status === "confirmed") return row;
  if (row.status === "failed" || row.status === "cancelled") {
    throw circleErrors.conflict("This contribution can no longer be confirmed.");
  }
  const txHash = normalizeTxHash(input.txHash);
  if (txHash) {
    await attachContributionTx({
      table: circleTables.earnContributions,
      id: row.id,
      actorWallet: input.actorWallet,
      txHash,
      transactionId:
        typeof input.transactionId === "string" ? input.transactionId : null,
    });
  }
  const hash = txHash ?? normalizeTxHash(row.tx_hash);
  if (!hash) {
    throw circleErrors.invalid("A valid on-chain transaction hash is required.");
  }
  try {
    const confirmed = await confirmEarnContributionFromTx(hash, {
      waitMs: 12_000,
      strict: false,
    });
    return confirmed ?? { ...row, tx_hash: hash, status: "submitted" as const };
  } catch (error) {
    console.error("[circle-earn-submit]", error);
    return { ...row, tx_hash: hash, status: "submitted" as const };
  }
}

export async function confirmEarnContributionFromTx(
  txHash: string,
  options?: { waitMs?: number; strict?: boolean },
) {
  const hash = normalizeTxHash(txHash);
  if (!hash) return null;
  const row = await findContributionByTxHash<CircleEarnContributionRecord>(
    circleTables.earnContributions,
    hash,
  );
  if (!row) return null;
  if (row.status === "confirmed") return row;
  if (row.status === "failed" || row.status === "cancelled") return null;

  let verified: Awaited<ReturnType<typeof verifyContributionRow>>;
  try {
    verified = await verifyContributionRow({
      amountUnits: row.amount_units,
      asset: row.asset,
      txHash: hash,
      waitMs: options?.waitMs ?? 0,
    });
  } catch (error) {
    console.error("[circle-earn-verify]", error);
    return null;
  }
  if (!verified.ok && verified.pending) {
    logDeposit({
      product: "earn",
      status: "pending",
      circleId: row.circle_id,
      txHash: hash,
      extra: { reason: verified.reason, contributionId: row.id },
    });
    return null;
  }
  if (!verified.ok) {
    await markContributionFailed(circleTables.earnContributions, row.id);
    logDeposit({
      product: "earn",
      status: "failed",
      circleId: row.circle_id,
      txHash: hash,
      extra: { reason: verified.reason, contributionId: row.id },
    });
    if (options?.strict) throw circleErrors.invalid(verified.reason);
    return null;
  }
  if (await txHashAlreadyConfirmed({ txHash: hash, exceptId: row.id })) {
    await markContributionFailed(circleTables.earnContributions, row.id);
    if (options?.strict) {
      throw circleErrors.conflict("This transaction was already credited.");
    }
    return null;
  }

  const supabase = circleDb();
  const { data: updated } = await supabase
    .from(circleTables.earnContributions)
    .update({
      status: "confirmed",
      tx_hash: hash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .neq("status", "confirmed")
    .select("*")
    .maybeSingle();
  if (!updated) return row;
  try {
    await confirmLedgerEntry(`earn:${row.idempotency_key}`, hash);
    await reconcileEarnBalance(row.circle_id);
  } catch (error) {
    console.error("[circle-earn-reconcile]", error);
  }
  try {
    await writeCircleActivity({
      circleId: row.circle_id,
      actorWallet: row.user_wallet,
      activityType: "earn.contribution",
      entityType: "earn_contribution",
      entityId: row.id,
      summary: `Contributed ${row.amount} ${row.asset} to Circle Earn`,
    });
    await postFinancialCard({
      circleId: row.circle_id,
      content: `Circle Earn contribution of ${row.amount} ${row.asset}`,
      metadata: { type: "earn_contribution", contributionId: row.id },
    });
    const members = await listActiveMemberWallets(row.circle_id);
    await notifyMany(members, {
      eventId: `circle-earn:${row.id}`,
      circleId: row.circle_id,
      kind: "circle_earn",
      title: "Circle Earn contribution",
      body: `${row.amount} ${row.asset} was added to Circle Earn.`,
    });
  } catch (error) {
    console.error("[circle-earn-notify]", error);
  }
  logDeposit({
    product: "earn",
    status: "confirmed",
    circleId: row.circle_id,
    txHash: hash,
    extra: { contributionId: row.id },
  });
  return updated as CircleEarnContributionRecord;
}

export async function settleSubmittedEarnContributions(circleId: string) {
  const rows = await listSubmittedDeposits<CircleEarnContributionRecord>(
    circleTables.earnContributions,
    circleId,
  );
  await Promise.all(
    rows.map(async (row) => {
      if (!row.tx_hash) return;
      try {
        await confirmEarnContributionFromTx(row.tx_hash, { waitMs: 0 });
      } catch {
        // Leave submitted/failed as recorded; overview must still load.
      }
    }),
  );
}

export async function reconcileEarnBalance(circleId: string) {
  const contributions = await sumConfirmedUnits({
    circleId,
    productType: "earn",
    entryType: "contribution",
  });
  const withdrawals = await sumConfirmedUnits({
    circleId,
    productType: "earn",
    entryType: "withdrawal",
  });
  const principal = contributions - withdrawals;
  if (principal < 0n) {
    throw circleErrors.conflict("Circle Earn ledger would go negative.");
  }
  const supabase = circleDb();
  const amount = unitsToAmount(principal, "USDC");
  await supabase
    .from(circleTables.earnAccounts)
    .update({
      principal: amount,
      principal_units: principal.toString(),
      current_value: amount,
      current_value_units: principal.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq("circle_id", circleId);
  return principal;
}
