import { parseLockRequest } from "@/lib/save/lock";
import { capSaveAmountForTarget } from "@/lib/save/target";
import { POCKET_ICON_PRESETS } from "@/lib/save/types";
import { isValidUuid } from "@/lib/save/validation";
import { writeCircleActivity } from "@/lib/swift-circle/activity";
import { writeCircleAudit } from "@/lib/swift-circle/audit";
import {
  assertCircleActive,
  loadCircle,
  requireActiveMember,
} from "@/lib/swift-circle/auth";
import { circleDb, circleTables, readCircleDbError } from "@/lib/swift-circle/db";
import { circleErrors } from "@/lib/swift-circle/errors";
import { MAX_CIRCLE_SAVE_POCKETS } from "@/lib/swift-circle/limits";
import { parseAmountUnits, parseUnits, unitsToAmount } from "@/lib/swift-circle/money";
import { assertPermission } from "@/lib/swift-circle/rbac";
import type { CircleSaveAccountRecord, CircleSavePocketRecord } from "@/lib/swift-circle/types";

function normalizeName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length < 1 || name.length > 50) return null;
  return name;
}

function normalizeIcon(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "piggy";
  const icon = value.trim().slice(0, 16);
  if (POCKET_ICON_PRESETS.some((preset) => preset.id === icon)) return icon;
  if (icon.length <= 8 && !/^[a-z_]+$/i.test(icon)) return icon;
  return "piggy";
}

export async function listSavePockets(circleId: string) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.savePockets)
    .select("*")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: true });
  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message ?? "")) {
      return [];
    }
    throw new Error(readCircleDbError(error, "Could not load Circle Save pockets."));
  }
  return (data ?? []) as CircleSavePocketRecord[];
}

export async function getSavePocket(circleId: string, pocketId: string) {
  if (!isValidUuid(pocketId)) throw circleErrors.invalid("A valid pocket is required.");
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.savePockets)
    .select("*")
    .eq("id", pocketId)
    .eq("circle_id", circleId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load the savings pocket."));
  }
  if (!data) throw circleErrors.notFound("Savings pocket");
  return data as CircleSavePocketRecord;
}

export async function createSavePocket(input: {
  actorWallet: string;
  circleId: string;
  name: unknown;
  icon?: unknown;
  description?: unknown;
  targetAmount?: unknown;
  stopAtTarget?: unknown;
  lockKind?: unknown;
  lockDays?: unknown;
  lockUntil?: unknown;
  requestId?: string;
}) {
  const circle = await loadCircle(input.circleId);
  assertCircleActive(circle);
  const member = await requireActiveMember(input.circleId, input.actorWallet);
  if (member.role !== "host") {
    throw circleErrors.forbidden("Only the Circle host can create savings pockets.");
  }
  assertPermission(member, "manage_save");
  const name = normalizeName(input.name);
  if (!name) throw circleErrors.invalid("Pocket name must be 1–50 characters.");
  const lock = parseLockRequest({
    lockKind: input.lockKind,
    lockDays: input.lockDays,
    lockUntil: input.lockUntil,
  });
  if (!lock.ok) throw circleErrors.invalid(lock.error);
  const lockValue = lock.value ?? { kind: "flexible" as const };

  let targetAmount: string | null = null;
  let targetAmountUnits: string | null = null;
  if (input.targetAmount !== undefined && input.targetAmount !== null && input.targetAmount !== "") {
    const parsed = parseAmountUnits(input.targetAmount, circle.currency);
    if (!parsed) throw circleErrors.invalid("Enter a valid pocket target.");
    targetAmount = parsed.amount;
    targetAmountUnits = parsed.amount_units;
  }

  const supabase = circleDb();
  const { data: accountRow, error: accountError } = await supabase
    .from(circleTables.saveAccounts)
    .select("*")
    .eq("circle_id", circle.id)
    .maybeSingle();
  if (accountError) {
    throw new Error(readCircleDbError(accountError, "Could not load Circle Save."));
  }
  if (!accountRow) throw circleErrors.notFound("Circle Save");
  const account = accountRow as CircleSaveAccountRecord;
  const { count, error: countError } = await supabase
    .from(circleTables.savePockets)
    .select("id", { count: "exact" })
    .eq("circle_id", circle.id)
    .eq("status", "active")
    .limit(0);
  if (countError) {
    throw new Error(readCircleDbError(countError, "Could not count savings pockets."));
  }
  if ((count ?? 0) >= MAX_CIRCLE_SAVE_POCKETS) {
    throw circleErrors.invalid(
      `This Circle already has ${MAX_CIRCLE_SAVE_POCKETS} active savings pockets.`,
    );
  }

  const description =
    typeof input.description === "string" ? input.description.trim().slice(0, 280) : "";
  const { data, error } = await supabase
    .from(circleTables.savePockets)
    .insert({
      circle_id: circle.id,
      circle_save_account_id: account.id,
      created_by_wallet: input.actorWallet,
      name,
      icon: normalizeIcon(input.icon),
      description: description || null,
      target_amount: targetAmount,
      target_amount_units: targetAmountUnits,
      current_balance: "0",
      current_balance_units: "0",
      currency: circle.currency,
      status: "active",
      stop_at_target: Boolean(input.stopAtTarget) && Boolean(targetAmountUnits),
      lock_kind: lockValue.kind,
      lock_until: lockValue.kind === "fixed" ? lockValue.until : null,
      lock_duration_days: lockValue.kind === "fixed" ? lockValue.days : null,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not create the savings pocket."));
  }
  const pocket = data as CircleSavePocketRecord;
  if ((count ?? 0) === 0) {
    await supabase
      .from(circleTables.saveContributions)
      .update({ pocket_id: pocket.id })
      .eq("circle_id", circle.id)
      .is("pocket_id", null);
    await supabase
      .from(circleTables.withdrawals)
      .update({ pocket_id: pocket.id })
      .eq("circle_id", circle.id)
      .eq("product_type", "save")
      .is("pocket_id", null);
    await reconcilePocketBalance(pocket.id);
  }
  await writeCircleAudit({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    action: "SAVE_POCKET_CREATED",
    entityType: "save_pocket",
    entityId: pocket.id,
    requestId: input.requestId,
    metadata: { action: "create_pocket", lockKind: pocket.lock_kind },
  });
  await writeCircleActivity({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    activityType: "save.pocket_created",
    entityType: "save_pocket",
    entityId: pocket.id,
    summary:
      pocket.lock_kind === "fixed"
        ? `Created fixed Circle Save pocket “${pocket.name}”`
        : `Created flexible Circle Save pocket “${pocket.name}”`,
  });
  return pocket;
}

export async function archiveSavePocket(input: {
  actorWallet: string;
  circleId: string;
  pocketId: string;
}) {
  const member = await requireActiveMember(input.circleId, input.actorWallet);
  if (member.role !== "host") {
    throw circleErrors.forbidden("Only the Circle host can archive savings pockets.");
  }
  const pocket = await getSavePocket(input.circleId, input.pocketId);
  if (pocket.status === "archived") return pocket;
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.savePockets)
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pocket.id)
    .select("*")
    .single();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not archive the savings pocket."));
  }
  return data as CircleSavePocketRecord;
}

export function assertPocketAcceptsDeposit(pocket: CircleSavePocketRecord, amountUnits: bigint) {
  if (pocket.status !== "active") {
    throw circleErrors.invalid("This savings pocket is archived.");
  }
  const target = pocket.target_amount_units
    ? parseUnits(pocket.target_amount_units)
    : null;
  const current = parseUnits(pocket.current_balance_units);
  const capped = capSaveAmountForTarget({
    plannedSaveUnits: amountUnits,
    currentBalanceUnits: current,
    targetAmountUnits: target,
    stopAtTarget: Boolean(pocket.stop_at_target),
  });
  if (capped.cappedUnits <= 0n) {
    throw circleErrors.invalid("This pocket has already reached its savings target.");
  }
  if (capped.wasCapped) {
    throw circleErrors.invalid(
      `This pocket only has ${unitsToAmount(capped.cappedUnits, pocket.currency)} remaining to target.`,
    );
  }
}

export async function reconcilePocketBalance(pocketId: string) {
  if (!isValidUuid(pocketId)) return 0n;
  const supabase = circleDb();
  const { data: contributions, error: contribError } = await supabase
    .from(circleTables.saveContributions)
    .select("amount_units,status")
    .eq("pocket_id", pocketId)
    .eq("status", "confirmed");
  if (contribError) {
    throw new Error(readCircleDbError(contribError, "Could not sum pocket deposits."));
  }
  let balance = 0n;
  for (const row of contributions ?? []) {
    balance += parseUnits(String(row.amount_units ?? "0"));
  }
  try {
    const { data: withdrawals, error: withdrawError } = await supabase
      .from(circleTables.withdrawals)
      .select("amount_units,status")
      .eq("pocket_id", pocketId)
      .eq("status", "confirmed");
    if (!withdrawError) {
      for (const row of withdrawals ?? []) {
        balance -= parseUnits(String(row.amount_units ?? "0"));
      }
    }
  } catch (error) {
    console.error("[circle-save-pocket-withdrawals]", error);
  }
  if (balance < 0n) {
    balance = 0n;
  }
  const { error: updateError } = await supabase
    .from(circleTables.savePockets)
    .update({
      current_balance: unitsToAmount(balance, "USDC"),
      current_balance_units: balance.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pocketId);
  if (updateError) {
    throw new Error(readCircleDbError(updateError, "Could not update pocket balance."));
  }
  return balance;
}
