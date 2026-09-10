import { circleDb, circleTables, readCircleDbError } from "@/lib/swift-circle/db";
import type { CircleActivityRecord } from "@/lib/swift-circle/types";

const HIDDEN_WITHDRAWAL_STATUSES = [
  "cancelled",
  "expired",
  "rejected",
  "failed",
] as const;

export async function deleteCircleActivityForEntities(input: {
  circleId: string;
  entityIds: string[];
}) {
  if (input.entityIds.length === 0) return;
  const supabase = circleDb();
  const { error } = await supabase
    .from(circleTables.activity)
    .delete()
    .eq("circle_id", input.circleId)
    .in("entity_id", input.entityIds);
  if (error) {
    console.warn(
      "[swift-circle-activity]",
      readCircleDbError(error, "activity delete failed"),
    );
  }
}

export async function writeCircleActivity(input: {
  circleId: string;
  actorWallet?: string | null;
  activityType: string;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = circleDb();
  const { error } = await supabase.from(circleTables.activity).insert({
    circle_id: input.circleId,
    actor_user_wallet: input.actorWallet ?? null,
    activity_type: input.activityType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.warn(
      "[swift-circle-activity]",
      readCircleDbError(error, "activity write failed"),
    );
  }
}

export async function listCircleActivity(circleId: string, limit = 50) {
  try {
    const { pruneStaleSaveWithdrawals } = await import(
      "@/lib/swift-circle/withdrawals"
    );
    await pruneStaleSaveWithdrawals(circleId);
  } catch (error) {
    console.error("[circle-activity-prune]", error);
  }
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.activity)
    .select("*")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load activity."));
  }
  const rows = (data ?? []) as CircleActivityRecord[];
  const { data: hidden } = await supabase
    .from(circleTables.withdrawals)
    .select("id")
    .eq("circle_id", circleId)
    .is("tx_hash", null)
    .in("status", [...HIDDEN_WITHDRAWAL_STATUSES]);
  const hiddenIds = new Set((hidden ?? []).map((row) => String(row.id)));
  if (hiddenIds.size === 0) {
    return rows;
  }
  const { data: hiddenApprovals } = await supabase
    .from(circleTables.approvals)
    .select("id")
    .in("withdrawal_proposal_id", [...hiddenIds]);
  for (const row of hiddenApprovals ?? []) {
    hiddenIds.add(String(row.id));
  }
  return rows.filter((row) => {
    if (!row.entity_id) return true;
    if (row.activity_type === "withdrawal.completed") return true;
    if (!hiddenIds.has(row.entity_id)) return true;
    return (
      row.entity_type !== "withdrawal_proposal" &&
      row.entity_type !== "withdrawal_approval"
    );
  });
}
