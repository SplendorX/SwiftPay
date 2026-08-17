"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Loader2,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address, Hash } from "viem";

import {
  fetchEarnTransactions,
  type EarnTransaction,
} from "@/lib/earn/transactions";
import { earnConfig, explorerTxUrl } from "@/lib/earn/config";
import { cn } from "@/lib/utils";
import { usePlatformWallet } from "@/lib/use-platform-wallet";

type SessionTx = {
  hash: Hash;
  type: "deposit" | "withdraw";
  assetsLabel: string;
  status: "pending" | "confirmed";
};

type EarnTransactionsProps = {
  /** Refresh when a deposit/withdraw confirms */
  refreshKey?: number | string;
  /** In-flight / just-submitted txs from the page */
  sessionTxs?: SessionTx[];
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function shortenHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function EarnTransactions({
  refreshKey,
  sessionTxs = [],
}: EarnTransactionsProps) {
  const { address: platformAddress, isConnected } = usePlatformWallet();
  const address = platformAddress as Address | undefined;
  const publicClient = usePublicClient();
  const vault = earnConfig.vaultAddress;

  const [txs, setTxs] = useState<EarnTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address || !vault) {
      setTxs([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchEarnTransactions({
        owner: address as Address,
        vault,
      });
      setTxs(result.transactions);
      // Only surface errors when we have nothing useful to show
      if (result.error && result.transactions.length === 0) {
        setError(result.error);
      } else {
        setError(null);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load transactions.";
      // Never show raw RPC dumps
      setError(
        message.includes("Request body") || message.length > 160
          ? "Could not load transaction history. Try refresh."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }, [address, vault]);

  useEffect(() => {
    void load();
  }, [load, refreshKey, publicClient]);

  // Merge session txs (pending) that are not yet in on-chain list
  const onchainHashes = new Set(txs.map((t) => t.hash.toLowerCase()));
  const pendingSession = sessionTxs.filter(
    (s) =>
      s.status === "pending" ||
      !onchainHashes.has(s.hash.toLowerCase()),
  );

  const displayRows: Array<
    | { kind: "onchain"; tx: EarnTransaction }
    | { kind: "session"; tx: SessionTx }
  > = [
    ...pendingSession.map((tx) => ({ kind: "session" as const, tx })),
    ...txs.map((tx) => ({ kind: "onchain" as const, tx })),
  ];

  if (!vault) {
    return (
      <section className="earn-tx-card">
        <div className="earn-tx-header">
          <Receipt className="h-4 w-4" />
          <h2>Earn transactions</h2>
        </div>
        <p className="earn-footnote">
          Vault not configured. Set <code>NEXT_PUBLIC_EARN_VAULT_ADDRESS</code>.
        </p>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section className="earn-tx-card">
        <div className="earn-tx-header">
          <Receipt className="h-4 w-4" />
          <h2>Earn transactions</h2>
        </div>
        <p className="earn-footnote">
          Connect your wallet to see deposits and withdrawals from the Earn
          vault.
        </p>
      </section>
    );
  }

  return (
    <section className="earn-tx-card">
      <div className="earn-tx-header">
        <div className="earn-tx-title-row">
          <Receipt className="h-4 w-4" />
          <h2>Earn transactions</h2>
        </div>
        <button
          className="earn-tx-refresh"
          disabled={loading}
          onClick={() => void load()}
          type="button"
          aria-label="Refresh transactions"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="earn-footnote earn-tx-sub">
        Deposits and withdrawals for your wallet from the Earn vault. Links open
        on ArcScan.
      </p>

      {error && displayRows.length === 0 && (
        <p className="earn-error earn-tx-error" role="status">
          {error}
        </p>
      )}

      {loading && displayRows.length === 0 ? (
        <div className="earn-tx-empty">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading vault activity…</span>
        </div>
      ) : displayRows.length === 0 ? (
        <div className="earn-tx-empty">
          <p>No Earn transactions yet.</p>
          <p className="earn-footnote">
            Deposit USDC to see activity here with ArcScan links.
          </p>
        </div>
      ) : (
        <ul className="earn-tx-list">
          {displayRows.map((row) => {
            if (row.kind === "session") {
              const Icon =
                row.tx.type === "deposit" ? ArrowDownToLine : ArrowUpFromLine;
              return (
                <li
                  className={cn(
                    "earn-tx-item",
                    row.tx.status === "pending" && "earn-tx-item-pending",
                  )}
                  key={`session-${row.tx.hash}`}
                >
                  <div
                    className={cn(
                      "earn-tx-icon",
                      row.tx.type === "deposit"
                        ? "earn-tx-icon-in"
                        : "earn-tx-icon-out",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="earn-tx-body">
                    <div className="earn-tx-row-top">
                      <span className="earn-tx-type">
                        {row.tx.type === "deposit" ? "Deposit" : "Withdraw"}
                      </span>
                      <span
                        className={cn(
                          "earn-tx-amount",
                          row.tx.type === "deposit"
                            ? "earn-tx-amount-in"
                            : "earn-tx-amount-out",
                        )}
                      >
                        {row.tx.type === "deposit" ? "+" : "−"}$
                        {row.tx.assetsLabel}
                      </span>
                    </div>
                    <div className="earn-tx-row-meta">
                      <span className="earn-tx-status">
                        {row.tx.status === "pending" ? "Pending…" : "Confirmed"}
                      </span>
                      <a
                        className="earn-tx-hash"
                        href={explorerTxUrl(row.tx.hash)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {shortenHash(row.tx.hash)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </li>
              );
            }

            const tx = row.tx;
            const Icon =
              tx.type === "deposit" ? ArrowDownToLine : ArrowUpFromLine;
            return (
              <li className="earn-tx-item" key={tx.id}>
                <div
                  className={cn(
                    "earn-tx-icon",
                    tx.type === "deposit"
                      ? "earn-tx-icon-in"
                      : "earn-tx-icon-out",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="earn-tx-body">
                  <div className="earn-tx-row-top">
                    <span className="earn-tx-type">
                      {tx.type === "deposit" ? "Deposit" : "Withdraw"}
                    </span>
                    <span
                      className={cn(
                        "earn-tx-amount",
                        tx.type === "deposit"
                          ? "earn-tx-amount-in"
                          : "earn-tx-amount-out",
                      )}
                    >
                      {tx.type === "deposit" ? "+" : "−"}${tx.assets}
                    </span>
                  </div>
                  <div className="earn-tx-row-meta">
                    <span>{formatWhen(tx.timestamp)}</span>
                    <span className="earn-tx-dot">·</span>
                    <span>Block {tx.blockNumber || "—"}</span>
                    <a
                      className="earn-tx-hash"
                      href={explorerTxUrl(tx.hash)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {shortenHash(tx.hash)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
