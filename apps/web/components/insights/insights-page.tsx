"use client";

import {
  ArrowLeft,
  ChevronRight,
  Inbox,
  ListOrdered,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MonthComparisonChart } from "@/components/insights/month-comparison-chart";
import {
  TransactionIcon,
  TransactionRow,
  useTransactionReceipts,
} from "@/components/transactions/transaction-parts";
import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import { insightPeriodDays, summarizePeriod, type PeriodSummary, type TokenSums } from "@/lib/activity/insights";
import type { AccountActivityItem } from "@/lib/activity/merge";
import { activityFeatureMeta, type ActivityFeed } from "@/lib/activity/types";
import { useAccountTransactions } from "@/lib/activity/use-account-transactions";
import { useDisplayCurrency } from "@/lib/display-currency";
import { convertFromUsd, formatConvertedAmount, useConversionRates, usdPerUnit } from "@/lib/use-conversion-rates";
import { bottomSheetClassName, useSheetSide } from "@/lib/use-media-query";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { cn } from "@/lib/utils";

import "./insights.css";

type View = "overview" | "analytics";
type Metric = "out" | "in";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Amounts in the reader's display currency (Settings → currency): USDC is a
 * dollar, EURC is converted at the live EUR rate. Without a rate it falls
 * back to plain token amounts, so nothing is ever shown at a made-up price.
 */
function useMoney() {
  const [currency] = useDisplayCurrency();
  const { rates } = useConversionRates();

  return useMemo(() => {
    const eurInUsd = usdPerUnit("EUR", rates);
    const toDisplay = (sums: TokenSums): number | undefined => {
      const usdc = sums.USDC ?? 0;
      const eurc = sums.EURC ?? 0;
      if (eurc > 0 && eurInUsd === undefined) return undefined;
      return convertFromUsd(usdc + eurc * (eurInUsd ?? 0), currency, rates);
    };
    const format = (value: number | undefined, fallback?: TokenSums) => {
      if (value !== undefined) return formatConvertedAmount(value, currency);
      const parts = [
        fallback?.USDC ? `${fallback.USDC.toFixed(2)} USDC` : null,
        fallback?.EURC ? `${fallback.EURC.toFixed(2)} EURC` : null,
      ].filter(Boolean);
      return parts.join(" + ") || formatConvertedAmount(0, currency);
    };
    const formatSums = (sums: TokenSums) => format(toDisplay(sums), sums);
    const tick = (value: number) => {
      try {
        return new Intl.NumberFormat(undefined, {
          currency,
          maximumFractionDigits: 1,
          notation: "compact",
          style: "currency",
        }).format(value);
      } catch {
        return String(Math.round(value));
      }
    };
    return { currency, format, formatSums, tick, toDisplay };
  }, [currency, rates]);
}

/** Running totals per day of `metric`, in the display currency. */
function runningTotals(summary: PeriodSummary, metric: Metric, toDisplay: (sums: TokenSums) => number | undefined) {
  let total = 0;
  return summary.days.map((day) => {
    total += toDisplay(day[metric]) ?? 0;
    return total;
  });
}

function shortDate(value: number | string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The last 30 days of the account's money: what came in, what went out, and where. */
export function InsightsPage() {
  const { address, isConnected } = usePlatformWallet();
  // Two periods: the last 30 days and the 30 before, for the comparison.
  const { error, items, loading, titleFor } = useAccountTransactions(address, insightPeriodDays * 2);
  const { modals, openerFor } = useTransactionReceipts(address);
  const money = useMoney();
  const [view, setView] = useState<View>("overview");
  const [metric, setMetric] = useState<Metric>("out");
  const [category, setCategory] = useState<ActivityFeed | null>(null);
  // "View analytics" can be linked to directly: /insights?view=analytics.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "analytics") setView("analytics");
  }, []);

  const tz = useMemo(() => new Date().getTimezoneOffset(), []);
  const { current, previous } = useMemo(
    () => ({
      current: summarizePeriod(items, { tzOffsetMinutes: tz }),
      previous: summarizePeriod(items, { back: 1, tzOffsetMinutes: tz }),
    }),
    [items, tz],
  );
  const periodFrom = Date.parse(current.from);
  const periodLabel = `${shortDate(periodFrom)} – ${shortDate(Date.now())}`;
  const ready = !loading;

  const header = (
    <header className="insights-bar">
      {view === "analytics" ? (
        <button aria-label="Back to Insights" className="insights-round-button" onClick={() => setView("overview")} type="button">
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : (
        <Link aria-label="Back to the dashboard" className="insights-round-button" href="/dashboard">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      )}
      <h1 className="insights-title">{view === "analytics" ? "Analytics" : "Insights"}</h1>
      <Link aria-label="All transactions" className="insights-round-button" href="/transactions" title="All transactions">
        <ListOrdered className="h-5 w-5" />
      </Link>
    </header>
  );

  if (!isConnected || !address) {
    return (
      <div className="insights-page">
        {header}
        <EmptyState body="Connect a wallet to see how your money moves." title="No wallet connected" />
      </div>
    );
  }

  // ── Analytics: the last 30 days against the 30 before ───────────────────
  if (view === "analytics") {
    const now = runningTotals(current, metric, money.toDisplay);
    const before = runningTotals(previous, metric, money.toDisplay);
    return (
      <div className="insights-page">
        {header}
        <div className="insights-segment" role="group" aria-label="Measure">
          {(
            [
              ["out", "Money out"],
              ["in", "Money in"],
            ] as const
          ).map(([value, label]) => (
            <button aria-pressed={metric === value} key={value} onClick={() => setMetric(value)} type="button">
              {label}
            </button>
          ))}
        </div>
        <section className="insights-card insights-chart-card">
          <h2 className="insights-card-title">Last 30 days vs the 30 before</h2>
          <p className="insights-card-sub">
            {metric === "out" ? "Running total of money out" : "Running total of money in"}, day by day
          </p>
          <MonthComparisonChart
            current={now}
            currentLabel="Last 30 days"
            dayLabel={(index) => shortDate(periodFrom + index * DAY_MS)}
            daysElapsed={current.dayCount}
            format={(value) => money.format(value)}
            formatTick={money.tick}
            previous={before}
            previousLabel="30 days before"
          />
        </section>

        <div className="insights-totals">
          <TotalRow
            active={metric === "in"}
            kind="in"
            label="Total income"
            onClick={() => setMetric("in")}
            value={money.formatSums(current.totals.in)}
          />
          <TotalRow
            active={metric === "out"}
            kind="out"
            label="Total expenses"
            onClick={() => setMetric("out")}
            value={money.formatSums(current.totals.out)}
          />
        </div>
        <p className="insights-footnote">
          {periodLabel}, in {money.currency}. Moves between your own accounts aren&rsquo;t counted.
        </p>
      </div>
    );
  }

  // ── Overview ────────────────────────────────────────────────────────────
  const spentNow = money.toDisplay(current.totals.out) ?? 0;
  const spentThen = money.toDisplay(previous.totals.out) ?? 0;
  const rows = current.categories
    .map((entry) => ({ ...entry, value: money.toDisplay(entry[metric]) ?? 0 }))
    .filter((entry) => entry.value > 0);
  const rowsTotal = rows.reduce((sum, entry) => sum + entry.value, 0);
  const categoryItems = category
    ? items.filter((item) => {
        const at = item.occurredAt ? Date.parse(item.occurredAt) : Number.NaN;
        return item.source === category && item.direction !== "internal" && at >= periodFrom;
      })
    : [];

  return (
    <div className="insights-page">
      {header}
      <p className="insights-period">
        <span>Last 30 days</span>
        {periodLabel}
      </p>

      {error && ready && items.length === 0 ? <p className="insights-error">{error}</p> : null}

      <div className="insights-flow">
        <FlowCard kind="in" label="Money in" loading={!ready} value={money.formatSums(current.totals.in)} />
        <FlowCard kind="out" label="Money out" loading={!ready} value={money.formatSums(current.totals.out)} />
      </div>

      <button className="insights-analytics-link" disabled={!ready} onClick={() => setView("analytics")} type="button">
        View analytics
        <ChevronRight className="h-4 w-4" />
      </button>

      {ready ? (
        <button className="insights-card insights-insight" onClick={() => setView("analytics")} type="button">
          <span className={cn("insights-insight-art", spentNow > spentThen ? "is-up" : "is-down")}>
            {spentNow > spentThen ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="insights-card-title">
              {spentNow === 0 ? "No spending in the last 30 days" : "Your spending in the last 30 days"}
            </span>
            <span className="insights-card-sub">
              {spentNow === 0
                ? "When you send, swap or pay, we'll show how it compares with the 30 days before."
                : spentThen === 0
                  ? `You've spent ${money.format(spentNow)}, and nothing in the 30 days before.`
                  : `You've spent ${money.format(spentNow)}, ${Math.abs(Math.round(((spentNow - spentThen) / spentThen) * 100))}% ${spentNow > spentThen ? "more" : "less"} than the 30 days before.`}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      ) : null}

      {ready && current.totals.count === 0 ? (
        <EmptyState
          body="Spend or receive money and we'll show you where it went, by category."
          title="Nothing in the last 30 days."
        />
      ) : ready ? (
        <section className="insights-card">
          <div className="insights-cat-head">
            <h2 className="insights-card-title">{metric === "out" ? "Where your money went" : "Where your money came from"}</h2>
            <div className="insights-segment is-compact" role="group" aria-label="Direction">
              {(
                [
                  ["out", "Out"],
                  ["in", "In"],
                ] as const
              ).map(([value, label]) => (
                <button aria-pressed={metric === value} key={value} onClick={() => setMetric(value)} type="button">
                  {label}
                </button>
              ))}
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="insights-card-sub">
              {metric === "out" ? "No money went out in the last 30 days." : "No money came in during the last 30 days."}
            </p>
          ) : (
            <ul className="insights-cats">
              {rows.map((entry) => {
                const share = rowsTotal > 0 ? entry.value / rowsTotal : 0;
                return (
                  <li key={entry.source}>
                    <button onClick={() => setCategory(entry.source)} type="button">
                      <TransactionIcon size="sm" source={entry.source} />
                      <span className="insights-cat-main">
                        <span className="insights-cat-row">
                          <span className="insights-cat-name">{activityFeatureMeta[entry.source]?.label ?? "Wallet"}</span>
                          <span className="insights-cat-value">{money.format(entry.value)}</span>
                        </span>
                        <span className="insights-cat-row is-sub">
                          <span>
                            {entry.count} {entry.count === 1 ? "transaction" : "transactions"}
                          </span>
                          <span>{Math.round(share * 100)}%</span>
                        </span>
                        <span aria-hidden className="insights-category-track">
                          <span className="insights-category-bar" style={{ width: `${Math.max(2, share * 100)}%` }} />
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <Link className="insights-statement-note" href="/transactions">
        <ListOrdered className="h-4 w-4 shrink-0" />
        <span>
          Insights cover the last 30 days. <strong>See all transactions</strong> from the last 3 months.
        </span>
      </Link>

      <CategorySheet
        items={categoryItems}
        label={category ? activityFeatureMeta[category]?.label ?? "Wallet" : ""}
        onClose={() => setCategory(null)}
        open={category !== null}
        openerFor={openerFor}
        titleFor={titleFor}
      />
      {modals}
    </div>
  );
}

function CategorySheet({
  items,
  label,
  onClose,
  open,
  openerFor,
  titleFor,
}: {
  items: AccountActivityItem[];
  label: string;
  onClose: () => void;
  open: boolean;
  openerFor: (item: AccountActivityItem) => (() => void) | null;
  titleFor: (item: AccountActivityItem) => string;
}) {
  const side = useSheetSide();
  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent
        className={cn("gap-0 p-0", side === "bottom" ? bottomSheetClassName : "w-full sm:max-w-md")}
        showCloseButton={false}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="insights-sheet">
          <SheetTitle className="text-center text-lg font-bold">{label}</SheetTitle>
          <SheetDescription className="text-center text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "transaction" : "transactions"} in the last 30 days
          </SheetDescription>
          <ul className="tx-list">
            {items.map((item) => (
              <li key={item.id}>
                <TransactionRow item={item} onOpen={openerFor(item)} title={titleFor(item)} />
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FlowCard({
  kind,
  label,
  loading,
  value,
}: {
  kind: "in" | "out";
  label: string;
  loading: boolean;
  value: string | null;
}) {
  return (
    <div className={cn("insights-card insights-flow-card", `is-${kind}`)}>
      <span aria-hidden className="insights-flow-icon">
        {kind === "in" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        {loading ? <span className="insights-skeleton" /> : <span className="insights-flow-value">{value}</span>}
        <span className="insights-flow-label">{label}</span>
      </span>
    </div>
  );
}

function TotalRow({
  active,
  kind,
  label,
  onClick,
  value,
}: {
  active: boolean;
  kind: "in" | "out";
  label: string;
  onClick: () => void;
  value: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn("insights-card insights-total", `is-${kind}`)}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden className="insights-flow-icon is-large">
        {kind === "in" ? <Plus className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="insights-flow-label">{label}</span>
        <span className="insights-total-value">{value}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="insights-empty">
      <span aria-hidden className="insights-empty-icon">
        <Inbox className="h-8 w-8" />
      </span>
      <p className="insights-empty-title">{title}</p>
      <p className="insights-empty-body">{body}</p>
    </div>
  );
}
