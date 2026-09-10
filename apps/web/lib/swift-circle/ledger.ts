import { circleDb, circleTables, isDuplicateError, readCircleDbError } from "@/lib/swift-circle/db";
import { parseUnits } from "@/lib/swift-circle/money";

export async function writeLedgerEntry(input: {
  circleId: string;
  actorWallet?: string | null;
  entryType:
    | "contribution"
    | "payment"
    | "withdrawal"
    | "refund"
    | "failed_transaction"
    | "reversal"
    | "yield_adjustment";
  productType: "personal" | "save" | "earn" | "pay";
  source: string;
  destination: string;
  amountUnits: string;
  asset: string;
  purpose: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  transactionId?: string | null;
  txHash?: string | null;
  status: "pending" | "submitted" | "confirmed" | "failed" | "reversed";
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.ledger)
    .insert({
      circle_id: input.circleId,
      actor_user_wallet: input.actorWallet ?? null,
      entry_type: input.entryType,
      product_type: input.productType,
      source: input.source,
      destination: input.destination,
      amount_units: input.amountUnits,
      asset: input.asset,
      purpose: input.purpose,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      transaction_id: input.transactionId ?? null,
      tx_hash: input.txHash ?? null,
      status: input.status,
      idempotency_key: input.idempotencyKey,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .maybeSingle();

  if (error && isDuplicateError(error)) {
    const existing = await supabase
      .from(circleTables.ledger)
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    return existing.data;
  }
  if (error) {
    throw new Error(readCircleDbError(error, "Could not write ledger entry."));
  }
  return data;
}

export async function confirmLedgerEntry(idempotencyKey: string, txHash?: string | null) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.ledger)
    .update({
      status: "confirmed",
      tx_hash: txHash ?? undefined,
    })
    .eq("idempotency_key", idempotencyKey)
    .neq("status", "confirmed")
    .select("*")
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not confirm ledger entry."));
  }
  return data;
}

export async function sumConfirmedUnits(input: {
  circleId: string;
  productType: "save" | "earn";
  entryType: "contribution" | "withdrawal";
}) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.ledger)
    .select("amount_units,entry_type,status")
    .eq("circle_id", input.circleId)
    .eq("product_type", input.productType)
    .eq("status", "confirmed");
  if (error) {
    throw new Error(readCircleDbError(error, "Could not sum ledger."));
  }
  let total = 0n;
  for (const row of data ?? []) {
    if (row.entry_type !== input.entryType) continue;
    total += parseUnits(String(row.amount_units ?? "0"));
  }
  return total;
}
