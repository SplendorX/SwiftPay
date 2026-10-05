"use client";

import { ArrowLeft, Check, FileDown, Inbox, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { StatementSheet } from "@/components/activity/statement-sheet";
import {
  TransactionIcon,
  TransactionRow,
  useTransactionReceipts,
} from "@/components/transactions/transaction-parts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import type { AccountActivityItem } from "@/lib/activity/merge";
import { activityFeatureMeta, transactionHistoryDays, type ActivityFeed } from "@/lib/activity/types";
import { useAccountTransactions } from "@/lib/activity/use-account-transactions";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type Direction = "all" | "in" | "out";

const pageSize = 40;
const featureOrder = Object.keys(activityFeatureMeta) as ActivityFeed[];

function monthKeyOf(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${date.getMonth()}`;
}

/** The months the three-month window touches, newest first. */
function windowMonths(now = new Date()) {
  const start = new Date(now.getTime() - transactionHistoryDays * 24 * 60 * 60 * 1000);
  const months: Array<{ key: string; label: string }> = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor.getTime() >= new Date(start.getFullYear(), start.getMonth(), 1).getTime()) {
    months.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

function dayHeading(value: string | null) {
  if (!value) return "Awaiting timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Awaiting timestamp";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function matches(item: AccountActivityItem, title: string, query: string) {
  const haystack = [
    title,
    activityFeatureMeta[item.source]?.label,
    item.amount,
    item.token,
    item.counterparty,
    item.transfer?.counterparty,
    ...item.txHashes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** Every transaction from the last three months; older ones are in statements. */
export function TransactionHistory() {
  const { address, isConnected } = usePlatformWallet();
  const { error, items, labelsLocked, loading, titleFor } = useAccountTransactions(address, transactionHistoryDays);
  const { modals, openerFor } = useTransactionReceipts(address);
  const months = useMemo(() => windowMonths(), []);
  const [month, setMonth] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<Direction>("all");
  const [features, setFeatures] = useState<ActivityFeed[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [shown, setShown] = useState(pageSize);

  const featureCounts = useMemo(() => {
    const counts = new Map<ActivityFeed, number>();
    items.forEach((item) => counts.set(item.source, (counts.get(item.source) ?? 0) + 1));
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (month === "all" || monthKeyOf(item.occurredAt) === month || !item.occurredAt) &&
        (direction === "all" || item.direction === direction) &&
        (features.length === 0 || features.includes(item.source)) &&
        (!needle || matches(item, titleFor(item) ?? "", needle)),
    );
  }, [direction, features, items, month, query, titleFor]);

  const groups = useMemo(() => {
    const out: Array<{ heading: string; items: AccountActivityItem[] }> = [];
    filtered.slice(0, shown).forEach((item) => {
      const heading = dayHeading(item.occurredAt);
      const last = out[out.length - 1];
      if (last?.heading === heading) last.items.push(item);
      else out.push({ heading, items: [item] });
    });
    return out;
  }, [filtered, shown]);

  const filterCount = (direction === "all" ? 0 : 1) + features.length;

  return (
    <div className="txh-page">
      <header className="txh-bar">
        <Link aria-label="Back to the dashboard" className="txh-round" href="/dashboard">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="txh-title">Transaction History</h1>
        <button
          aria-label="Download statement"
          className="txh-round"
          onClick={() => setStatementOpen(true)}
          title="Download statement"
          type="button"
        >
          <FileDown className="h-5 w-5" />
        </button>
      </header>

      <div className="txh-tools">
        <label className="txh-search">
          <Search className="h-4 w-4 shrink-0" />
          <input
            aria-label="Search transactions"
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(pageSize);
            }}
            placeholder="Search"
            type="search"
            value={query}
          />
          {query ? (
            <button aria-label="Clear search" onClick={() => setQuery("")} type="button">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        <button
          aria-label="Filters"
          className={cn("txh-filter", filterCount > 0 && "is-active")}
          onClick={() => setFiltersOpen(true)}
          type="button"
        >
          <SlidersHorizontal className="h-5 w-5" />
          {filterCount > 0 ? <span className="txh-filter-count">{filterCount}</span> : null}
        </button>
      </div>

      <div aria-label="Month" className="txh-months" role="tablist">
        <button aria-selected={month === "all"} className="txh-month" onClick={() => setMonth("all")} role="tab" type="button">
          Last 3 months
        </button>
        {months.map((entry) => (
          <button
            aria-selected={month === entry.key}
            className="txh-month"
            key={entry.key}
            onClick={() => {
              setMonth(entry.key);
              setShown(pageSize);
            }}
            role="tab"
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>

      {labelsLocked && isConnected ? (
        <p className="txh-notice">Sign in to this wallet to see which feature made each transaction.</p>
      ) : null}

      <section className="txh-list" aria-live="polite">
        {!isConnected || !address ? (
          <Empty body="Connect a wallet to see your transactions." />
        ) : loading ? (
          <p className="txh-loading">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions
          </p>
        ) : items.length === 0 ? (
          <Empty body={error ?? "No transactions in the last 3 months."} />
        ) : filtered.length === 0 ? (
          <Empty body="Nothing matches your search or filters." />
        ) : (
          groups.map((group) => (
            <div className="txh-group" key={group.heading}>
              <p className="txh-day">{group.heading}</p>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <TransactionRow item={item} onOpen={openerFor(item)} title={titleFor(item)} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {filtered.length > shown ? (
        <Button className="h-11 w-full rounded-xl" onClick={() => setShown((current) => current + pageSize)} variant="outline">
          Show more ({filtered.length - shown} left)
        </Button>
      ) : null}

      <button className="txh-older" onClick={() => setStatementOpen(true)} type="button">
        <FileDown className="h-4 w-4 shrink-0" />
        <span>
          This list covers the last 3 months. For anything older, <strong>download a statement</strong>.
        </span>
      </button>

      <FilterSheet
        counts={featureCounts}
        direction={direction}
        features={features}
        onApply={(nextDirection, nextFeatures) => {
          setDirection(nextDirection);
          setFeatures(nextFeatures);
          setShown(pageSize);
          setFiltersOpen(false);
        }}
        onClose={() => setFiltersOpen(false)}
        open={filtersOpen}
      />
      <StatementSheet onOpenChange={setStatementOpen} open={statementOpen} ownerWallet={address} />
      {modals}
    </div>
  );
}

function Empty({ body }: { body: string }) {
  return (
    <div className="txh-empty">
      <span aria-hidden className="txh-empty-icon">
        <Inbox className="h-7 w-7" />
      </span>
      <p>{body}</p>
    </div>
  );
}

function FilterSheet({
  counts,
  direction,
  features,
  onApply,
  onClose,
  open,
}: {
  counts: Map<ActivityFeed, number>;
  direction: Direction;
  features: ActivityFeed[];
  onApply: (direction: Direction, features: ActivityFeed[]) => void;
  onClose: () => void;
  open: boolean;
}) {
  const side = useSheetSide();
  const [draftDirection, setDraftDirection] = useState(direction);
  const [draftFeatures, setDraftFeatures] = useState(features);
  const available = featureOrder.filter((key) => counts.has(key));

  // Each opening starts from the filters in force.
  useEffect(() => {
    if (!open) return;
    setDraftDirection(direction);
    setDraftFeatures(features);
  }, [direction, features, open]);

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent
        className={cn(
          "gap-0 p-0",
          side === "bottom" ? "max-h-[85dvh] rounded-t-[1.75rem] border-t-0" : "w-full sm:max-w-sm",
        )}
        showCloseButton={false}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="txh-sheet">
          <SheetTitle className="text-center text-lg font-bold">Filter transactions</SheetTitle>
          <SheetDescription className="sr-only">Choose which transactions to show</SheetDescription>

          <p className="txh-sheet-label">Type</p>
          <div className="txh-segment" role="group">
            {(
              [
                ["all", "All"],
                ["in", "Money in"],
                ["out", "Money out"],
              ] as const
            ).map(([value, label]) => (
              <button aria-pressed={draftDirection === value} key={value} onClick={() => setDraftDirection(value)} type="button">
                {label}
              </button>
            ))}
          </div>

          <p className="txh-sheet-label">Category</p>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <ul className="txh-categories">
              {available.map((key) => {
                const checked = draftFeatures.includes(key);
                return (
                  <li key={key}>
                    <button
                      aria-pressed={checked}
                      onClick={() =>
                        setDraftFeatures((current) =>
                          checked ? current.filter((value) => value !== key) : [...current, key],
                        )
                      }
                      type="button"
                    >
                      <TransactionIcon size="sm" source={key} />
                      <span className="min-w-0 flex-1 truncate">{activityFeatureMeta[key].label}</span>
                      <span className="txh-category-count">{counts.get(key)}</span>
                      <span className={cn("txh-check", checked && "is-on")}>
                        {checked ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="txh-sheet-actions">
            <Button className="h-12 w-full rounded-xl font-bold" onClick={() => onApply(draftDirection, draftFeatures)} type="button">
              Show results
            </Button>
            <Button
              className="h-11 w-full rounded-xl"
              onClick={() => {
                setDraftDirection("all");
                setDraftFeatures([]);
              }}
              type="button"
              variant="ghost"
            >
              Clear filters
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
