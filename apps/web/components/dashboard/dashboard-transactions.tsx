"use client";

import { ChevronRight, Inbox, Loader2 } from "lucide-react";
import Link from "next/link";

import { TransactionRow, useTransactionReceipts } from "@/components/transactions/transaction-parts";
import { useAccountTransactions } from "@/lib/activity/use-account-transactions";
import { activityWindowDays } from "@/lib/activity/types";

/** The newest few transactions, with "View all" leading to Transaction History. */
export function DashboardTransactions({
  ownerWallet,
  refreshKey,
}: {
  ownerWallet?: string | null;
  /** Change to refetch, e.g. when a payment settles. */
  refreshKey?: string;
}) {
  const { error, items, loading, titleFor } = useAccountTransactions(ownerWallet, activityWindowDays, refreshKey);
  const { modals, openerFor } = useTransactionReceipts(ownerWallet);
  const latest = items.slice(0, 5);

  return (
    <section aria-labelledby="dashboard-transactions-title" className="tx-card">
      <header className="tx-card-head">
        <h2 id="dashboard-transactions-title">
          Transactions
          <span aria-hidden className="tx-live-dot" />
        </h2>
        <Link className="tx-view-all" href="/transactions">
          View all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </header>

      {!ownerWallet ? (
        <p className="tx-card-empty">Connect a wallet to see your transactions.</p>
      ) : loading ? (
        <p className="tx-card-empty">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions
        </p>
      ) : latest.length === 0 ? (
        <div className="tx-card-empty">
          <Inbox className="h-5 w-5" />
          {error ?? "No transactions in the last 30 days."}
        </div>
      ) : (
        <ul className="tx-list">
          {latest.map((item) => (
            <li key={item.id}>
              <TransactionRow item={item} onOpen={openerFor(item)} title={titleFor(item)} />
            </li>
          ))}
        </ul>
      )}
      {modals}
    </section>
  );
}
