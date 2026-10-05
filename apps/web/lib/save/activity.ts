/**
 * A pocket's activity: its ledger rows, with each Spend&Save enriched by the
 * payment that triggered it. Pure (shared by the page and its tests).
 *
 * Every Spend&Save has a ledger row *and* an event row describing the
 * payment, so listing both would show each save twice. The ledger is the
 * spine (it covers deposits and withdrawals too, and carries the refund
 * action) and each Spend&Save row is enriched with its event. An event whose
 * ledger row has not landed yet is still listed, so nothing disappears.
 */
import type {
  SavingsTransactionRecord,
  SavingsTransactionStatus,
  SavingsTransactionType,
  SpendSaveEventRecord,
} from "@/lib/save/types";
import type { ArcTokenSymbol } from "@/lib/tokens";

export type PocketActivityFilter = "ALL" | "DEPOSIT" | "WITHDRAWAL" | "SPEND_SAVE";

export type PocketActivityKind = "deposit" | "withdrawal" | "spend_save" | "refund" | "reversal" | "adjustment";

export type PocketActivityItem = {
  id: string;
  kind: PocketActivityKind;
  /** Which filter tab it belongs to (refunds and the like sit under All only). */
  group: PocketActivityFilter;
  /** "in" adds to the pocket, "out" takes from it. */
  direction: "in" | "out";
  amount: string;
  currency: ArcTokenSymbol;
  status: SavingsTransactionStatus;
  createdAt: string;
  txHash: string | null;
  /** Spend&Save only: the payment that triggered the save. */
  spend?: { paymentAmount: string; paymentTxHash: string | null; savePercentage: number };
  /** The ledger row, when there is one; it carries the reverse-refund action. */
  transaction?: SavingsTransactionRecord;
  failureReason?: string | null;
};

const kindOf: Record<SavingsTransactionType, PocketActivityKind> = {
  ADJUSTMENT: "adjustment",
  DEPOSIT: "deposit",
  REFUND: "refund",
  REVERSAL: "reversal",
  SPEND_SAVE: "spend_save",
  WITHDRAWAL: "withdrawal",
};

const groupOf: Record<PocketActivityKind, PocketActivityFilter> = {
  adjustment: "ALL",
  deposit: "DEPOSIT",
  refund: "ALL",
  reversal: "ALL",
  spend_save: "SPEND_SAVE",
  withdrawal: "WITHDRAWAL",
};

/** Money leaves the pocket on a withdrawal, refund or reversal. */
const outgoing = new Set<PocketActivityKind>(["withdrawal", "refund", "reversal"]);

export function buildPocketActivity(
  pocketId: string,
  transactions: readonly SavingsTransactionRecord[],
  spendEvents: readonly SpendSaveEventRecord[],
): PocketActivityItem[] {
  const ownTransactions = transactions.filter((tx) => tx.pocket_id === pocketId);
  const ownEvents = spendEvents.filter((event) => event.pocket_id === pocketId);
  const eventByTransaction = new Map<string, SpendSaveEventRecord>();
  for (const event of ownEvents) {
    if (event.savings_transaction_id) eventByTransaction.set(event.savings_transaction_id, event);
  }

  const items: PocketActivityItem[] = ownTransactions.map((tx) => {
    const kind = kindOf[tx.type] ?? "adjustment";
    const event = eventByTransaction.get(tx.id);
    return {
      amount: tx.amount,
      createdAt: tx.created_at,
      currency: tx.currency,
      direction: outgoing.has(kind) ? "out" : "in",
      group: groupOf[kind],
      id: `tx:${tx.id}`,
      kind,
      status: tx.status,
      transaction: tx,
      txHash: tx.tx_hash,
      ...(event
        ? {
            spend: {
              paymentAmount: event.payment_amount,
              paymentTxHash: event.payment_tx_hash,
              savePercentage: Number(event.save_percentage),
            },
          }
        : {}),
    };
  });

  const linked = new Set(ownTransactions.map((tx) => tx.id));
  for (const event of ownEvents) {
    if (event.savings_transaction_id && linked.has(event.savings_transaction_id)) continue;
    items.push({
      amount: event.save_amount,
      createdAt: event.created_at,
      currency: event.currency,
      direction: "in",
      failureReason: event.failure_reason,
      group: "SPEND_SAVE",
      id: `event:${event.id}`,
      kind: "spend_save",
      spend: {
        paymentAmount: event.payment_amount,
        paymentTxHash: event.payment_tx_hash,
        savePercentage: Number(event.save_percentage),
      },
      status: event.status,
      txHash: null,
    });
  }

  return items.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function countByGroup(items: readonly PocketActivityItem[]) {
  return {
    ALL: items.length,
    DEPOSIT: items.filter((item) => item.group === "DEPOSIT").length,
    SPEND_SAVE: items.filter((item) => item.group === "SPEND_SAVE").length,
    WITHDRAWAL: items.filter((item) => item.group === "WITHDRAWAL").length,
  } satisfies Record<PocketActivityFilter, number>;
}
