import type { CircleAuditAction } from "@/lib/swift-circle/types";
import { circleDb, circleTables } from "@/lib/swift-circle/db";

export async function writeCircleAudit(input: {
  circleId?: string | null;
  actorWallet?: string | null;
  action: CircleAuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}) {
  try {
    const supabase = circleDb();
    await supabase.from(circleTables.audit).insert({
      circle_id: input.circleId ?? null,
      actor_user_wallet: input.actorWallet ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? {},
      request_id: input.requestId ?? null,
    });
  } catch (error) {
    console.warn(
      "[swift-circle-audit]",
      error instanceof Error ? error.message : "audit write failed",
    );
  }
}

export async function listCircleAudit(circleId: string, limit = 100) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.audit)
    .select("*")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
