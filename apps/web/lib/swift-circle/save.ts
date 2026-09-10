import { writeCircleActivity } from "@/lib/swift-circle/activity";
import { getAddress } from "viem";

import { swiftSaveVaultAddress } from "@/lib/save/config";
import {
  circleSavePocketIdBytes32,
  readCircleSaveVaultHoldings,
  requireCircleSaveVault,
} from "@/lib/swift-circle/vault";
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
  writeLedgerEntry,
} from "@/lib/swift-circle/ledger";
import { loadPlatformLimits, assertUnderLimit } from "@/lib/swift-circle/limits";
import {
  parseAmountUnits,
  parseUnits,
  progressPercent,
  unitsToAmount,
} from "@/lib/swift-circle/money";
import { notifyMany } from "@/lib/swift-circle/notifications";
import {
  attachContributionTx,
  findContributionByTxHash,
  listSubmittedDeposits,
  logDeposit,
  markContributionFailed,
  normalizeTxHash,
  txHashAlreadyConfirmed,
  verifyContributionRow,
} from "@/lib/swift-circle/deposits";
import {
  assertPocketAcceptsDeposit,
  getSavePocket,
  listSavePockets,
  reconcilePocketBalance,
} from "@/lib/swift-circle/pockets";
import { consumeCircleRateLimit } from "@/lib/swift-circle/rate-limit";
import { assertPermission } from "@/lib/swift-circle/rbac";
import { listActiveMemberWallets } from "@/lib/swift-circle/service";
import { arcTestnetTokens } from "@/lib/tokens";
import type {
  CircleSaveAccountRecord,
  CircleSaveContributionRecord,
  CircleSavePocketRecord,
} from "@/lib/swift-circle/types";

function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 128) return null;
  return key;
}

export async function getSaveAccount(circleId: string) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.saveAccounts)
    .select("*")
    .eq("circle_id", circleId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load Circle Save."));
  }
  if (!data) throw circleErrors.notFound("Circle Save");
  return data as CircleSaveAccountRecord;
}

async function loadConfirmedSaveWithdrawals(circleId: string) {
  try {
    const supabase = circleDb();
    const { data, error } = await supabase
      .from(circleTables.withdrawals)
      .select("amount_units,status,product_type,pocket_id")
      .eq("circle_id", circleId)
      .eq("status", "confirmed");
    if (error) {
      console.error("[circle-save-withdrawals]", error.message);
      return [];
    }
    return (data ?? []).filter(
      (row) =>
        !row.product_type || row.product_type === "save" || row.product_type === "personal",
    ) as Array<{
      amount_units?: string | null;
      pocket_id?: string | null;
      product_type?: string | null;
    }>;
  } catch (error) {
    console.error("[circle-save-withdrawals]", error);
    return [];
  }
}

export async function computeSaveBalances(
  circleId: string,
  contributions: CircleSaveContributionRecord[],
  homePocketId?: string,
) {
  const confirmed = contributions.filter((row) => row.status === "confirmed");
  const pocketDeposits = new Map<string, bigint>();
  let deposits = 0n;
  for (const row of confirmed) {
    const units = parseUnits(row.amount_units);
    deposits += units;
    const pocketId = row.pocket_id || homePocketId;
    if (pocketId) {
      pocketDeposits.set(pocketId, (pocketDeposits.get(pocketId) ?? 0n) + units);
    }
  }
  const withdrawals = await loadConfirmedSaveWithdrawals(circleId);
  const pocketWithdrawals = new Map<string, bigint>();
  let withdrawn = 0n;
  for (const row of withdrawals) {
    const units = parseUnits(String(row.amount_units ?? "0"));
    withdrawn += units;
    if (row.pocket_id) {
      pocketWithdrawals.set(
        row.pocket_id,
        (pocketWithdrawals.get(row.pocket_id) ?? 0n) + units,
      );
    }
  }
  const net = deposits - withdrawn;
  return {
    net: net < 0n ? 0n : net,
    pocketNet(pocketId: string) {
      const value =
        (pocketDeposits.get(pocketId) ?? 0n) - (pocketWithdrawals.get(pocketId) ?? 0n);
      return value < 0n ? 0n : value;
    },
  };
}

const SAVE_LEDGER_GRACE_MS = 3 * 60 * 1000;

async function pruneUnbackedSaveContributions(input: {
  circleId: string;
  contributions: CircleSaveContributionRecord[];
  homePocketId?: string;
  pockets: CircleSavePocketRecord[];
  vaultUnitsByPocket: Map<string, bigint>;
}) {
  const now = Date.now();
  const ids: string[] = [];
  for (const pocket of input.pockets) {
    const vaultUnits = input.vaultUnitsByPocket.get(pocket.id) ?? 0n;
    const confirmed = input.contributions
      .filter(
        (row) =>
          row.status === "confirmed" &&
          (row.pocket_id === pocket.id ||
            (!row.pocket_id && pocket.id === input.homePocketId)),
      )
      .sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      );
    let ledger = 0n;
    for (const row of confirmed) {
      ledger += parseUnits(row.amount_units);
    }
    if (ledger <= vaultUnits) {
      continue;
    }
    let extra = ledger - vaultUnits;
    for (const row of confirmed) {
      if (extra <= 0n) {
        break;
      }
      const ageMs = now - new Date(row.created_at).getTime();
      if (ageMs < SAVE_LEDGER_GRACE_MS) {
        continue;
      }
      ids.push(row.id);
      extra -= parseUnits(row.amount_units);
      row.status = "cancelled";
    }
  }
  if (ids.length === 0) {
    return false;
  }
  const supabase = circleDb();
  const { error } = await supabase
    .from(circleTables.saveContributions)
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("circle_id", input.circleId)
    .in("id", ids)
    .eq("status", "confirmed");
  if (error) {
    console.error("[circle-save-prune-ledger]", error.message);
    return false;
  }
  const { error: ledgerError } = await supabase
    .from(circleTables.ledger)
    .update({
      status: "reversed",
    })
    .eq("circle_id", input.circleId)
    .eq("related_entity_type", "save_contribution")
    .in("related_entity_id", ids);
  if (ledgerError) {
    console.error("[circle-save-prune-entries]", ledgerError.message);
  }
  return true;
}

async function persistComputedSaveBalances(
  circleId: string,
  accountId: string,
  pockets: CircleSavePocketRecord[],
  balances: Awaited<ReturnType<typeof computeSaveBalances>>,
) {
  const supabase = circleDb();
  try {
    await supabase
      .from(circleTables.saveAccounts)
      .update({
        balance: unitsToAmount(balances.net, "USDC"),
        balance_units: balances.net.toString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);
  } catch (error) {
    console.error("[circle-save-persist-account]", error);
  }
  await Promise.all(
    pockets.map(async (pocket) => {
      const units = balances.pocketNet(pocket.id);
      if (
        pocket.current_balance_units === units.toString() &&
        pocket.current_balance === unitsToAmount(units, pocket.currency)
      ) {
        return;
      }
      try {
        await supabase
          .from(circleTables.savePockets)
          .update({
            current_balance: unitsToAmount(units, pocket.currency),
            current_balance_units: units.toString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", pocket.id)
          .eq("circle_id", circleId);
      } catch (error) {
        console.error("[circle-save-persist-pocket]", error);
      }
    }),
  );
}

export async function getSaveOverview(circleId: string) {
  await settleSubmittedSaveContributions(circleId);
  const circle = await loadCircle(circleId);
  const account = await getSaveAccount(circleId);
  const supabase = circleDb();
  const { data: contributions, error } = await supabase
    .from(circleTables.saveContributions)
    .select("*")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load contributions."));
  }
  const rows = (contributions ?? []) as CircleSaveContributionRecord[];
  const pockets = await listSavePockets(circleId);
  const activePockets = pockets.filter((pocket) => pocket.status === "active");
  if (activePockets.length === 1 && activePockets[0]) {
    const homePocketId = activePockets[0].id;
    const orphanIds = rows
      .filter((row) => row.status === "confirmed" && !row.pocket_id)
      .map((row) => row.id);
    if (orphanIds.length > 0) {
      const { error: attachError } = await supabase
        .from(circleTables.saveContributions)
        .update({
          pocket_id: homePocketId,
          updated_at: new Date().toISOString(),
        })
        .in("id", orphanIds);
      if (attachError) {
        console.error("[circle-save-orphan]", attachError.message);
      } else {
        for (const row of rows) {
          if (row.status === "confirmed" && !row.pocket_id) {
            row.pocket_id = homePocketId;
          }
        }
      }
    }
  }
  const balances = await computeSaveBalances(circleId, rows);
  const vault = swiftSaveVaultAddress();
  const token = arcTestnetTokens[circle.currency];
  const vaultUnitsByPocket = new Map<string, bigint>();
  let usedVault = false;
  if (vault && token?.address) {
    try {
      const owners = await listActiveMemberWallets(circleId);
      await Promise.all(
        pockets.map(async (pocket) => {
          const { total } = await readCircleSaveVaultHoldings({
            owners,
            pocketId: pocket.id,
            token: token.address,
            vault,
          });
          vaultUnitsByPocket.set(pocket.id, total);
        }),
      );
      usedVault = true;
    } catch (error) {
      console.error("[circle-save-vault-balances]", error);
    }
  }
  if (usedVault) {
    try {
      const { pruneStaleSaveWithdrawals } = await import(
        "@/lib/swift-circle/withdrawals"
      );
      await pruneStaleSaveWithdrawals(circleId);
    } catch (error) {
      console.error("[circle-save-prune-wd]", error);
    }
    await pruneUnbackedSaveContributions({
      circleId,
      contributions: rows,
      homePocketId:
        pockets.filter((pocket) => pocket.status === "active").length === 1
          ? pockets.find((pocket) => pocket.status === "active")?.id
          : undefined,
      pockets,
      vaultUnitsByPocket,
    });
  }
  const vaultNet = [...vaultUnitsByPocket.values()].reduce(
    (sum, units) => sum + units,
    0n,
  );
  const liveAccount = {
    ...account,
    balance: unitsToAmount(
      usedVault ? vaultNet : balances.net,
      circle.currency,
    ),
    balance_units: (usedVault ? vaultNet : balances.net).toString(),
  };
  const livePockets = pockets.map((pocket) => {
    const units = usedVault
      ? (vaultUnitsByPocket.get(pocket.id) ?? 0n)
      : balances.pocketNet(pocket.id);
    return {
      ...pocket,
      current_balance: unitsToAmount(units, pocket.currency),
      current_balance_units: units.toString(),
    };
  });
  void persistComputedSaveBalances(circleId, account.id, pockets, {
    ...balances,
    net: usedVault ? vaultNet : balances.net,
    pocketNet(pocketId: string) {
      if (usedVault) {
        return vaultUnitsByPocket.get(pocketId) ?? 0n;
      }
      return balances.pocketNet(pocketId);
    },
  });
  const target = liveAccount.target_amount_units
    ? parseUnits(liveAccount.target_amount_units)
    : null;
  const confirmed = rows.filter((row) => row.status === "confirmed");
  const byMember = new Map<string, bigint>();
  for (const row of confirmed) {
    const current = byMember.get(row.user_wallet) ?? 0n;
    byMember.set(row.user_wallet, current + parseUnits(row.amount_units));
  }
  return {
    account: liveAccount,
    pocketOwner: circle.host_user_wallet,
    vaultAddress: swiftSaveVaultAddress(),
    progress: progressPercent(
      usedVault ? vaultNet : balances.net,
      target,
    ),
    contributions: rows,
    pockets: livePockets,
    memberTotals: [...byMember.entries()].map(([wallet, units]) => ({
      wallet,
      amount_units: units.toString(),
      amount: unitsToAmount(units, "USDC"),
    })),
  };
}

export async function updateSaveGoal(input: {
  actorWallet: string;
  circleId: string;
  goalName?: unknown;
  targetAmount?: unknown;
  targetDate?: unknown;
}) {
  const circle = await loadCircle(input.circleId);
  const member = await requireActiveMember(input.circleId, input.actorWallet);
  assertPermission(member, "manage_save");
  const account = await getSaveAccount(input.circleId);
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.goalName !== undefined) {
    if (input.goalName === null || input.goalName === "") {
      patch.goal_name = null;
    } else if (typeof input.goalName === "string") {
      const name = input.goalName.trim().slice(0, 80);
      patch.goal_name = name || null;
    }
  }
  if (input.targetAmount !== undefined) {
    if (input.targetAmount === null || input.targetAmount === "") {
      patch.target_amount = null;
      patch.target_amount_units = null;
    } else {
      const parsed = parseAmountUnits(input.targetAmount, circle.currency);
      if (!parsed) throw circleErrors.invalid("Enter a valid goal amount.");
      patch.target_amount = parsed.amount;
      patch.target_amount_units = parsed.amount_units;
    }
  }
  if (input.targetDate !== undefined) {
    if (input.targetDate === null || input.targetDate === "") {
      patch.target_date = null;
    } else if (typeof input.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) {
      patch.target_date = input.targetDate;
    } else {
      throw circleErrors.invalid("Enter a valid target date.");
    }
  }
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.saveAccounts)
    .update(patch)
    .eq("id", account.id)
    .select("*")
    .single();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not update Circle Save."));
  }
  return data as CircleSaveAccountRecord;
}

export async function proposeSaveContribution(input: {
  actorWallet: string;
  circleId: string;
  amount: unknown;
  pocketId?: unknown;
  idempotencyKey?: unknown;
  requestId?: string;
}) {
  consumeCircleRateLimit({ bucket: "SAVE", wallet: input.actorWallet });
  const circle = await loadCircle(input.circleId);
  assertCircleActive(circle);
  assertNotFrozen(circle);
  const member = await requireActiveMember(input.circleId, input.actorWallet);
  assertPermission(member, "contribute_save");
  const parsed = parseAmountUnits(input.amount, circle.currency);
  if (!parsed) throw circleErrors.invalid("Enter a valid contribution amount.");
  const limits = await loadPlatformLimits();
  assertUnderLimit(parsed.units, limits.max_save_contribution_units, "Contribution");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) {
    throw circleErrors.invalid("An idempotency key is required.");
  }
  const vault = requireCircleSaveVault();
  const pocketOwner = getAddress(circle.host_user_wallet);
  const account = await getSaveAccount(circle.id);
  if (typeof input.pocketId !== "string") {
    throw circleErrors.invalid("Choose a Circle Save pocket to deposit into.");
  }
  const pocket = await getSavePocket(circle.id, input.pocketId);
  assertPocketAcceptsDeposit(pocket, parsed.units);
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.saveContributions)
    .insert({
      circle_save_account_id: account.id,
      circle_id: circle.id,
      pocket_id: pocket.id,
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
      .from(circleTables.saveContributions)
      .select("*")
      .eq("user_wallet", input.actorWallet)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    return {
      contribution: existing as CircleSaveContributionRecord,
      pocketIdBytes32: circleSavePocketIdBytes32(pocket.id),
      pocketOwner,
      reused: true,
      tokenAddress: arcTestnetTokens[circle.currency].address,
      vaultAddress: vault,
    };
  }
  if (error) {
    throw new Error(readCircleDbError(error, "Could not create contribution."));
  }
  await writeLedgerEntry({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    entryType: "contribution",
    productType: "save",
    source: input.actorWallet,
    destination: `circle_save_pocket:${pocket.id}`,
    metadata: { pocketId: pocket.id, pocketName: pocket.name },
    amountUnits: parsed.amount_units,
    asset: circle.currency,
    purpose: "circle_save_contribution",
    relatedEntityType: "save_contribution",
    relatedEntityId: data.id,
    status: "pending",
    idempotencyKey: `save:${idempotencyKey}`,
  });
  await writeCircleAudit({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    action: "SAVE_CONTRIBUTION",
    entityType: "save_contribution",
    entityId: data.id,
    requestId: input.requestId,
  });
  return {
    contribution: data as CircleSaveContributionRecord,
    pocketIdBytes32: circleSavePocketIdBytes32(pocket.id),
    pocketOwner,
    reused: false,
    tokenAddress: arcTestnetTokens[circle.currency].address,
    vaultAddress: vault,
  };
}

export async function submitSaveContribution(input: {
  actorWallet: string;
  contributionId: string;
  txHash?: unknown;
  transactionId?: unknown;
}) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.saveContributions)
    .select("*")
    .eq("id", input.contributionId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load contribution."));
  }
  if (!data) throw circleErrors.notFound("Contribution");
  const row = data as CircleSaveContributionRecord;
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
    .from(circleTables.saveContributions)
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
  const submitted = (updated ?? row) as CircleSaveContributionRecord;
  if (!submitted.tx_hash) return submitted;
  try {
    const confirmed = await confirmSaveContributionFromTx(submitted.tx_hash, {
      waitMs: 12_000,
      strict: false,
    });
    return confirmed ?? submitted;
  } catch (error) {
    console.error("[circle-save-submit]", error);
    return submitted;
  }
}

export async function confirmSaveContributionById(input: {
  actorWallet: string;
  contributionId: string;
  txHash?: unknown;
  transactionId?: unknown;
}) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.saveContributions)
    .select("*")
    .eq("id", input.contributionId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load contribution."));
  }
  if (!data) throw circleErrors.notFound("Contribution");
  const row = data as CircleSaveContributionRecord;
  if (row.user_wallet !== input.actorWallet) throw circleErrors.forbidden();
  if (row.status === "confirmed") return row;
  if (row.status === "failed" || row.status === "cancelled") {
    throw circleErrors.conflict("This contribution can no longer be confirmed.");
  }
  const txHash = normalizeTxHash(input.txHash);
  if (txHash) {
    await attachContributionTx({
      table: circleTables.saveContributions,
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
  const confirmed = await confirmSaveContributionFromTx(hash, {
    waitMs: 12_000,
    strict: true,
  });
  return confirmed ?? { ...row, tx_hash: hash, status: "submitted" as const };
}

export async function confirmSaveContributionFromTx(
  txHash: string,
  options?: { waitMs?: number; strict?: boolean },
) {
  const hash = normalizeTxHash(txHash);
  if (!hash) return null;
  const row = await findContributionByTxHash<CircleSaveContributionRecord>(
    circleTables.saveContributions,
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
    console.error("[circle-save-verify]", error);
    return null;
  }
  if (!verified.ok && verified.pending) {
    logDeposit({
      product: "save",
      status: "pending",
      circleId: row.circle_id,
      txHash: hash,
      extra: { reason: verified.reason, contributionId: row.id },
    });
    return null;
  }
  if (!verified.ok) {
    await markContributionFailed(circleTables.saveContributions, row.id);
    logDeposit({
      product: "save",
      status: "failed",
      circleId: row.circle_id,
      txHash: hash,
      extra: { reason: verified.reason, contributionId: row.id },
    });
    if (options?.strict) throw circleErrors.invalid(verified.reason);
    return null;
  }
  if (await txHashAlreadyConfirmed({ txHash: hash, exceptId: row.id })) {
    await markContributionFailed(circleTables.saveContributions, row.id);
    if (options?.strict) {
      throw circleErrors.conflict("This transaction was already credited.");
    }
    return null;
  }

  const supabase = circleDb();
  const { data: updated } = await supabase
    .from(circleTables.saveContributions)
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
    await confirmLedgerEntry(`save:${row.idempotency_key}`, hash);
  } catch (error) {
    console.error("[circle-save-ledger]", error);
  }
  try {
    if (row.pocket_id) {
      await reconcilePocketBalance(row.pocket_id);
    }
  } catch (error) {
    console.error("[circle-save-pocket]", error);
  }
  try {
    await reconcileSaveBalance(row.circle_id);
  } catch (error) {
    console.error("[circle-save-account]", error);
  }
  try {
    await writeCircleActivity({
      circleId: row.circle_id,
      actorWallet: row.user_wallet,
      activityType: "save.contribution",
      entityType: "save_contribution",
      entityId: row.id,
      summary: `Contributed ${row.amount} ${row.asset} to Circle Save`,
    });
    await postFinancialCard({
      circleId: row.circle_id,
      actorWallet: row.user_wallet,
      content: `Circle Save contribution of ${row.amount} ${row.asset}`,
      metadata: {
        type: "save_contribution",
        contributionId: row.id,
        pocketId: row.pocket_id ?? null,
      },
    });
    const members = await listActiveMemberWallets(row.circle_id);
    await notifyMany(members, {
      eventId: `circle-save:${row.id}`,
      circleId: row.circle_id,
      kind: "circle_save",
      title: "Circle Save contribution",
      body: `${row.amount} ${row.asset} was added to Circle Save.`,
    });
  } catch (error) {
    console.error("[circle-save-notify]", error);
  }
  logDeposit({
    product: "save",
    status: "confirmed",
    circleId: row.circle_id,
    txHash: hash,
    extra: { contributionId: row.id },
  });
  return updated as CircleSaveContributionRecord;
}

export async function settleSubmittedSaveContributions(circleId: string) {
  const rows = await listSubmittedDeposits<CircleSaveContributionRecord>(
    circleTables.saveContributions,
    circleId,
  );
  await Promise.all(
    rows.map(async (row) => {
      if (!row.tx_hash) return;
      try {
        await confirmSaveContributionFromTx(row.tx_hash, { waitMs: 0 });
      } catch {
        // Leave submitted/failed as recorded; overview must still load.
      }
    }),
  );
}

export async function reconcileSaveBalance(circleId: string) {
  const supabase = circleDb();
  const { data: contribs, error } = await supabase
    .from(circleTables.saveContributions)
    .select("amount_units,status,pocket_id")
    .eq("circle_id", circleId)
    .eq("status", "confirmed");
  if (error) {
    throw new Error(readCircleDbError(error, "Could not sum Circle Save deposits."));
  }
  const rows = (contribs ?? []) as CircleSaveContributionRecord[];
  const pockets = await listSavePockets(circleId);
  const homePocketId =
    pockets.filter((pocket) => pocket.status === "active").length === 1
      ? pockets.find((pocket) => pocket.status === "active")?.id
      : undefined;
  const balances = await computeSaveBalances(circleId, rows, homePocketId);
  const { error: updateError } = await supabase
    .from(circleTables.saveAccounts)
    .update({
      balance: unitsToAmount(balances.net, "USDC"),
      balance_units: balances.net.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq("circle_id", circleId);
  if (updateError) {
    throw new Error(readCircleDbError(updateError, "Could not update Circle Save balance."));
  }
  return balances.net;
}
