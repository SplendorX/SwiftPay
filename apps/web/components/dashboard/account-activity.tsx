"use client";

import {
  AlertCircle,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  FileText,
  HandCoins,
  Loader2,
  PiggyBank,
  ReceiptText,
  Send,
  Store,
  TrendingUp,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AllieMark } from "@/components/allie/AllieMark";
import {
  accountActivityChangedEventName,
  fetchAccountActivity,
} from "@/lib/activity/client";
import {
  mergeAccountActivity,
  receiptTransferFor,
  shortAddress,
  type AccountActivityItem,
} from "@/lib/activity/merge";
import {
  activityFeatureMeta,
  activityWindowStart,
  type AccountActivityEntry,
  type ActivityFeed,
} from "@/lib/activity/types";
import { allieSenderLabel, useWalletUsernames } from "@/lib/activity/usernames";
import { openAllie } from "@/lib/allie/open";
import type { WalletTransfer } from "@/lib/arcscan-history";
import { cn } from "@/lib/utils";
import { arcChain } from "@/lib/chains";

const pageSize = 10;

/**
 * ALLIE's own mark in place of a generic icon. Sized inline: `.allie-mark`
 * carries its own 2.5rem default, which would otherwise win over utilities.
 */
function AllieIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return <AllieMark className={cn("account-activity-allie", className)} size={size} />;
}

const featureIcons: Record<ActivityFeed, LucideIcon | typeof AllieIcon> = {
  send: Send,
  request: HandCoins,
  payroll: Banknote,
  circle: UsersRound,
  swap: ArrowLeftRight,
  invoice: FileText,
  save: PiggyBank,
  earn: TrendingUp,
  batch: Users,
  recurepay: CalendarClock,
  agent: AllieIcon,
  points: Coins,
  checkout: Store,
  wallet: Wallet,
};

/** Chip order: the order features appear in the product, wallet last. */
const featureOrder = Object.keys(activityFeatureMeta) as ActivityFeed[];

type DirectionFilter = "all" | "in" | "out";

function formatAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function dayKey(value: string | null) {
  if (!value) return "undated";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "undated" : date.toDateString();
}

function dayLabel(key: string) {
  if (key === "undated") return "Awaiting timestamp";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key === today.toDateString()) return "Today";
  if (key === yesterday.toDateString()) return "Yesterday";
  const date = new Date(key);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    weekday: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

function timeLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function pageWindow(current: number, total: number) {
  // First, last, and the pages around the current one; gaps become "…".
  const pages = new Set([0, total - 1, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

function ActivityAmount({ item }: { item: AccountActivityItem }) {
  if (!item.amount) return null;

  if (item.source === "swap" && item.amountIn && item.tokenIn) {
    return (
      <p className="account-activity-amount">
        <span>
          −{formatAmount(item.amount)} {item.token}
        </span>
        <span className="account-activity-amount-in">
          +{formatAmount(item.amountIn)} {item.tokenIn}
        </span>
      </p>
    );
  }

  const sign = item.direction === "in" ? "+" : item.direction === "out" ? "−" : "";
  return (
    <p
      className={cn(
        "account-activity-amount",
        item.direction === "in" && "account-activity-amount-in",
      )}
    >
      {sign}
      {formatAmount(item.amount)} {item.token}
    </p>
  );
}

export function AccountActivity({
  className,
  hideHeading = false,
  isConnected,
  onOpenBatch,
  onOpenReceipt,
  ownerWallet,
  range,
  transfers,
  transfersError,
  transfersLoading,
  walletExplorerUrl,
}: {
  /** Only show activity in this window (epoch ms), e.g. one month on Insights. */
  range?: { from: number; to: number };
  className?: string;
  /** For hosts that draw their own page header (the Activity page). */
  hideHeading?: boolean;
  isConnected: boolean;
  /** BatchPay rows with stored recipients open the full batch receipt. */
  onOpenBatch?: (item: AccountActivityItem) => void;
  onOpenReceipt: (transfer: WalletTransfer) => void;
  ownerWallet?: string | null;
  transfers: WalletTransfer[];
  transfersError: string | null;
  transfersLoading: boolean;
  walletExplorerUrl: string;
}) {
  const [entries, setEntries] = useState<AccountActivityEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [labelsLocked, setLabelsLocked] = useState(false);
  const [feature, setFeature] = useState<ActivityFeed | "all">("all");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [page, setPage] = useState(0);

  const loadEntries = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!ownerWallet) {
        setEntries([]);
        return;
      }
      setEntriesLoading(true);
      try {
        const next = await fetchAccountActivity(ownerWallet);
        if (!signal?.cancelled) {
          setEntries(next);
          setLabelsLocked(false);
        }
      } catch (error) {
        // Feature labels are an enrichment. Without them the on-chain
        // history still renders, labelled as wallet activity.
        if (!signal?.cancelled) {
          setEntries([]);
          setLabelsLocked(
            error instanceof Error && /authorize this wallet/i.test(error.message),
          );
        }
      } finally {
        if (!signal?.cancelled) setEntriesLoading(false);
      }
    },
    [ownerWallet],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void loadEntries(signal);
    const refresh = () => void loadEntries(signal);
    window.addEventListener(accountActivityChangedEventName, refresh);
    return () => {
      signal.cancelled = true;
      window.removeEventListener(accountActivityChangedEventName, refresh);
    };
  }, [loadEntries]);

  // New on-chain transfers (a payment just confirmed) may belong to a feature
  // record written moments ago, so pick the labels up again.
  const transferCount = transfers.length;
  useEffect(() => {
    if (transferCount > 0) void loadEntries();
  }, [loadEntries, transferCount]);

  // Activity covers the last 30 days; older history is in statements.
  const rangeFrom = range?.from;
  const rangeTo = range?.to;
  const items = useMemo(() => {
    const windowStart = activityWindowStart().getTime();
    const from = Math.max(windowStart, rangeFrom ?? windowStart);
    const to = rangeTo ?? Number.POSITIVE_INFINITY;
    return mergeAccountActivity(entries, transfers).filter((item) => {
      const at = item.occurredAt ? Date.parse(item.occurredAt) : Number.NaN;
      // Undated rows are just-confirmed payments still waiting for a block time.
      return Number.isNaN(at) ? rangeTo === undefined : at >= from && at <= to;
    });
  }, [entries, rangeFrom, rangeTo, transfers]);

  const usernameFor = useWalletUsernames([
    ...items.map((item) => item.transfer?.counterparty ?? item.counterparty),
    ...items.flatMap((item) => item.batch?.recipients.map((r) => r.wallet) ?? []),
  ]);

  // Show a SwiftPay counterparty by @username rather than their address.
  function displayTitle(item: AccountActivityItem) {
    // BatchPay: name who was paid, e.g. "Batch payment to @ada, @ben +2".
    // A payroll run keeps its own title ("Payroll run · September").
    if (item.batch?.recipients.length && item.batch.kind !== "payroll") {
      const names = item.batch.recipients.map((recipient) => {
        const username = usernameFor(recipient.wallet);
        return recipient.label ?? (username ? `@${username}` : shortAddress(recipient.wallet));
      });
      const shown = names.slice(0, 2).join(", ");
      return `Batch payment to ${shown}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
    }
    const wallet = item.transfer?.counterparty ?? item.counterparty;
    // Money ALLIE sent comes from the sender's Agent Wallet: name the owner.
    const viaAllie = item.source === "wallet" && item.direction === "in"
      ? allieSenderLabel(wallet)
      : null;
    if (viaAllie) return `Received from ${viaAllie}`;
    const username = usernameFor(wallet);
    if (!wallet || !username || !item.title) return item.title;
    return item.title.replace(shortAddress(wallet), `@${username}`);
  }

  const featureCounts = useMemo(() => {
    const counts = new Map<ActivityFeed, number>();
    items.forEach((item) => counts.set(item.source, (counts.get(item.source) ?? 0) + 1));
    return counts;
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (feature === "all" || item.source === feature) &&
          (direction === "all" || item.direction === direction),
      ),
    [direction, feature, items],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [feature, direction]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const groups = useMemo(() => {
    const out: Array<{ key: string; items: AccountActivityItem[] }> = [];
    pageItems.forEach((item) => {
      const key = dayKey(item.occurredAt);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(item);
      else out.push({ key, items: [item] });
    });
    return out;
  }, [pageItems]);

  const isLoading = (transfersLoading || entriesLoading) && items.length === 0;
  const rangeStart = filtered.length === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min(filtered.length, (page + 1) * pageSize);

  return (
    <section className={cn("account-activity", className)} id="activity">
      <div className="account-activity-head" hidden={hideHeading}>
        <h2 className="section-title">Activity</h2>
        <a
          className="account-activity-explorer"
          href={walletExplorerUrl}
          rel="noreferrer"
          target="_blank"
        >
          View on ArcScan
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="account-activity-board">
        <div className="account-activity-toolbar">
          <div
            aria-label="Filter by feature"
            className="account-activity-chips"
            role="group"
          >
            <button
              aria-pressed={feature === "all"}
              className="account-activity-chip"
              onClick={() => setFeature("all")}
              type="button"
            >
              All
              <span className="account-activity-chip-count">{items.length}</span>
            </button>
            {featureOrder
              .filter((key) => featureCounts.has(key))
              .map((key) => {
                const Icon = featureIcons[key];
                return (
                  <button
                    aria-pressed={feature === key}
                    className="account-activity-chip"
                    data-feature={key}
                    key={key}
                    onClick={() => setFeature(key)}
                    type="button"
                  >
                    <Icon className="h-3.5 w-3.5" size={14} />
                    {activityFeatureMeta[key].label}
                    <span className="account-activity-chip-count">
                      {featureCounts.get(key)}
                    </span>
                  </button>
                );
              })}
          </div>

          <div
            aria-label="Filter by direction"
            className="account-activity-segment"
            role="group"
          >
            {(
              [
                ["all", "All"],
                ["in", "Money in"],
                ["out", "Money out"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={direction === value}
                key={value}
                onClick={() => setDirection(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {labelsLocked && isConnected ? (
          <p className="account-activity-notice">
            Sign in to this wallet to see which feature made each transaction.
          </p>
        ) : null}

        <div className="account-activity-list">
          {!isConnected ? (
            <p className="account-activity-empty">
              Connect a wallet to see your account activity.
            </p>
          ) : isLoading ? (
            <p className="account-activity-empty">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading account activity
            </p>
          ) : transfersError && items.length === 0 ? (
            <p className="account-activity-empty account-activity-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {transfersError}
            </p>
          ) : items.length === 0 ? (
            <p className="account-activity-empty">
              {range
                ? "No transactions in this period."
                : "No activity in the last 30 days. Payments, swaps, savings and everything else you do on SwiftPay will show up here."}
            </p>
          ) : filtered.length === 0 ? (
            <p className="account-activity-empty">
              Nothing matches these filters.
            </p>
          ) : (
            groups.map((group) => (
              <div className="account-activity-group" key={group.key}>
                <p className="account-activity-day">{dayLabel(group.key)}</p>
                <ul>
                  {group.items.map((item) => {
                    const meta = activityFeatureMeta[item.source];
                    const Icon = featureIcons[item.source];
                    const time = timeLabel(item.occurredAt);
                    const hash = item.transfer?.hash ?? item.txHashes[0];
                    const receiptTransfer = receiptTransferFor(item);
                    const openReceipt =
                      item.batch && onOpenBatch
                        ? () => onOpenBatch(item)
                        : receiptTransfer
                          ? () => onOpenReceipt(receiptTransfer)
                          : null;
                    return (
                      <li
                        className="account-activity-row"
                        data-feature={item.source}
                        data-has-receipt={openReceipt ? "" : undefined}
                        key={item.id}
                        // The whole row opens the receipt — the easiest target
                        // on a phone. Links and buttons inside keep their own job.
                        onClick={(event) => {
                          if (!openReceipt) return;
                          if ((event.target as HTMLElement).closest("a, button")) return;
                          openReceipt();
                        }}
                      >
                        <span
                          aria-hidden
                          className="account-activity-icon"
                          // ALLIE's mark stands on its own, without a tinted tile.
                          style={item.source === "agent" ? { background: "transparent" } : undefined}
                        >
                          <Icon className="h-[1.05rem] w-[1.05rem]" size={20} />
                        </span>

                        <div className="account-activity-main">
                          <p className="account-activity-title">{displayTitle(item)}</p>
                          <p className="account-activity-meta">
                            {item.source === "agent" ? (
                              <button
                                className="account-activity-feature"
                                onClick={openAllie}
                                type="button"
                              >
                                {meta.label}
                                <ArrowUpRight className="h-3 w-3" />
                              </button>
                            ) : meta.href ? (
                              <Link className="account-activity-feature" href={meta.href}>
                                {meta.label}
                                <ArrowUpRight className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="account-activity-feature">{meta.label}</span>
                            )}
                            {time ? <span>{time}</span> : null}
                            <span className="account-activity-status">Confirmed</span>
                          </p>
                        </div>

                        <div className="account-activity-side">
                          <ActivityAmount item={item} />
                          <div className="account-activity-actions">
                            {receiptTransfer || (item.batch && onOpenBatch) ? (
                              <button
                                aria-label="View receipt"
                                onClick={() =>
                                  item.batch && onOpenBatch
                                    ? onOpenBatch(item)
                                    : onOpenReceipt(receiptTransfer!)
                                }
                                title="Receipt"
                                type="button"
                              >
                                <ReceiptText className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {hash ? (
                              <a
                                aria-label="View on ArcScan"
                                href={`${arcChain.blockExplorers.default.url}/tx/${hash}`}
                                rel="noreferrer"
                                target="_blank"
                                title="View on ArcScan"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {filtered.length > 0 ? (
          <div className="account-activity-footer">
            <p>
              Showing {rangeStart}–{rangeEnd} of {filtered.length}
            </p>
            {totalPages > 1 ? (
              <nav aria-label="Activity pages" className="account-activity-pager">
                <button
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageWindow(page, totalPages).map((entry, index) =>
                  entry === "gap" ? (
                    <span aria-hidden key={`gap-${index}`}>
                      …
                    </span>
                  ) : (
                    <button
                      aria-current={entry === page ? "page" : undefined}
                      key={entry}
                      onClick={() => setPage(entry)}
                      type="button"
                    >
                      {entry + 1}
                    </button>
                  ),
                )}
                <button
                  aria-label="Next page"
                  disabled={page >= totalPages - 1}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages - 1, current + 1))
                  }
                  type="button"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
