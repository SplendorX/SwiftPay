import { businessDb, businessTables } from "@/lib/business/db";

export async function writeBusinessAudit(input: {
  actorWallet?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
  workspaceId: string;
}) {
  try {
    await businessDb().from(businessTables.audit).insert({
      actor_wallet: input.actorWallet ?? null,
      entity_id: input.entityId ?? null,
      entity_type: input.entityType ?? null,
      event_type: input.eventType,
      metadata: input.metadata ?? {},
      workspace_id: input.workspaceId,
    });
  } catch (error) {
    console.error("[swiftpay-business] audit write failed", error);
  }
}
