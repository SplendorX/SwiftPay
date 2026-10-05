"use client";

import {
  ArrowLeft,
  ChevronRight,
  FileDown,
  Inbox,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatementSheet } from "@/components/activity/statement-sheet";
import { WalletReceiptModal } from "@/components/activity/wallet-receipt-modal";
import { BatchReceiptModal, type BatchReceiptData } from "@/components/batch/batch-receipt-modal";
import { AccountActivity } from "@/components/dashboard/account-activity";
import { MonthComparisonChart } from "@/components/insights/month-comparison-chart";
import { fetchInsights } from "@/lib/activity/client";
import type { MonthSummary, TokenSums } from "@/lib/activity/insights";
import type { AccountActivityItem } from "@/lib/activity/merge";
import { activityFeatureMeta, activityWindowStart } from "@/lib/activity/types";
import type { WalletTransfer } from "@/lib/arcscan-history";
import { downloadBatchReceiptImage, shareBatchReceiptImage } from "@/lib/batch-receipt";
import { arcChain } from "@/lib/chains";
import { useDisplayCurrency } from "@/lib/display-currency";
import type { ArcTokenSymbol } from "@/lib/tokens";
import { convertFromUsd, formatConvertedAmount, useConversionRates, usdPerUnit } from "@/lib/use-conversion-rates";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { useWalletTransfers } from "@/lib/use-wallet-transfers";
import { cn } from "@/lib/utils";

type Insights = Awaited<ReturnType<typeof fetchInsights>>;
type View = "overview" | "analytics";
type Metric = "out" | "in";

/** Rebuild a BulkPay receipt from the batch details kept with the activity. */
function batchReceiptFrom(item: AccountActivityItem, wallet: string): BatchReceiptData | null {
  const batch = item.batch;
  if (!batch?.recipients.length) return null;
  const token = (item.token ?? "USDC") as ArcTokenSymbol;
  const hash = item.transfer?.hash ?? item.txHashes[0] ?? null;
  return {
    explorerUrl: hash ? `${arcChain.blockExplorers.default.url}/tx/${hash}` : null,
    feeAmount: batch.fee ?? "Not recorded",
    kind: batch.kind ?? "batch",
    mode: batch.mode ?? "BulkPay",
    payoutTotal: `${item.amount ?? "0"} ${token}`,
    recipientCount: batch.recipients.length,
    recipients: batch.recipients.map((recipient, index) => ({
      address: recipient.wallet,
      amount: recipient.amount,
      label: recipient.label ?? undefined,
      line: index + 1,
    })),
    runName: batch.name ?? null,
    submittedAt: item.occurredAt ?? new Date().toISOString(),
    token,
    txHash: hash,
    walletAddress: wallet,
  };
}

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

function monthLabel(month: string, style: "long" | "short" = "short") {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return style === "long"
    ? date.toLocaleDateString(undefined, { month: "long" })
    : `${date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()} ${year}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    from: new Date(year, monthNumber - 1, 1).getTime(),
    to: new Date(year, monthNumber, 1).getTime() - 1,
  };
}

/** Running totals per day of `metric`, in the display currency. */
function runningTotals(summary: MonthSummary, metric: Metric, toDisplay: (sums: TokenSums) => number | undefined) {
  let total = 0;
  return summary.days.map((day) => {
    total += toDisplay(day[metric]) ?? 0;
    return total;
  });
}

/** The account's money, month by month: Insights (formerly Activity). */
export function InsightsPage() {
  const { address, isConnected } = usePlatformWallet();
  const { error: transfersError, isLoading: transfersLoading, transfers } = useWalletTransfers(address);
  const money = useMoney();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  // "View analytics" can be linked to directly: /insights?view=analytics.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "analytics") setView("analytics");
  }, []);
  const [selected, setSelected] = useState<"current" | "previous">("current");
  const [metric, setMetric] = useState<Metric>("out");
  const [statementOpen, setStatementOpen] = useState(false);
  const [receipt, setReceipt] = useState<WalletTransfer | null>(null);
  const [batchReceipt, setBatchReceipt] = useState<BatchReceiptData | null>(null);
  const closeReceipt = useCallback(() => setReceipt(null), []);
  const closeBatchReceipt = useCallback(() => setBatchReceipt(null), []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setLoadError(null);
    void fetchInsights(address)
      .then((next) => {
        if (!cancelled) setInsights(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Insights couldn't be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [address, transfers.length]);

  const month = insights ? insights[selected] : null;
  const range = month ? monthBounds(month.month) : undefined;
  const windowStart = activityWindowStart();
  const listStartsLate = Boolean(range && range.from < windowStart.getTime());

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
      <button
        aria-label="Download statement"
        className="insights-round-button"
        onClick={() => setStatementOpen(true)}
        title="Download statement"
        type="button"
      >
        <FileDown className="h-5 w-5" />
      </button>
    </header>
  );

  const monthTabs = insights ? (
    <div className="insights-months" role="tablist" aria-label="Month">
      {(["previous", "current"] as const).map((key) => (
        <button
          aria-selected={selected === key}
          className="insights-month"
          key={key}
          onClick={() => setSelected(key)}
          role="tab"
          type="button"
        >
          {monthLabel(insights[key].month)}
        </button>
      ))}
    </div>
  ) : null;

  const statement = (
    <StatementSheet onOpenChange={setStatementOpen} open={statementOpen} ownerWallet={address} />
  );

  if (!isConnected || !address) {
    return (
      <div className="insights-page">
        {header}
        <EmptyState body="Connect a wallet to see how your money moves." title="No wallet connected" />
        {statement}
      </div>
    );
  }

  // ── Analytics: this month against last month ────────────────────────────
  if (view === "analytics" && insights) {
    const current = runningTotals(insights.current, metric, money.toDisplay);
    const previous = runningTotals(insights.previous, metric, money.toDisplay);
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
          <h2 className="insights-card-title">This month vs last month</h2>
          <p className="insights-card-sub">
            {metric === "out" ? "Running total of money out" : "Running total of money in"}, day by day
          </p>
          <MonthComparisonChart
            current={current}
            currentLabel={monthLabel(insights.current.month, "long")}
            daysElapsed={insights.current.daysElapsed}
            format={(value) => money.format(value)}
            formatTick={money.tick}
            monthShort={new Date(`${insights.current.month}-01T12:00:00`).toLocaleDateString("en-US", { month: "short" })}
            previous={previous}
            previousLabel={monthLabel(insights.previous.month, "long")}
          />
        </section>

        <div className="insights-totals">
          <TotalRow
            active={metric === "in"}
            kind="in"
            label="Total income"
            onClick={() => setMetric("in")}
            value={money.formatSums(insights.current.totals.in)}
          />
          <TotalRow
            active={metric === "out"}
            kind="out"
            label="Total expenses"
            onClick={() => setMetric("out")}
            value={money.formatSums(insights.current.totals.out)}
          />
        </div>
        <p className="insights-footnote">
          Totals for {monthLabel(insights.current.month, "long")} so far, in {money.currency}. Moves between your own
          accounts aren&rsquo;t counted.
        </p>
        {statement}
      </div>
    );
  }

  // ── Overview ────────────────────────────────────────────────────────────
  const spentNow = insights
    ? runningTotals(insights.current, "out", money.toDisplay)[Math.max(0, insights.current.daysElapsed - 1)] ?? 0
    : 0;
  const spentThen = insights
    ? runningTotals(insights.previous, "out", money.toDisplay)[
        Math.max(0, Math.min(insights.previous.daysInMonth, insights.current.daysElapsed) - 1)
      ] ?? 0
    : 0;
  const categoriesOut = month
    ? month.categories
        .map((category) => ({ ...category, value: money.toDisplay(category.out) ?? 0 }))
        .filter((category) => category.value > 0)
    : [];
  const totalOut = categoriesOut.reduce((sum, category) => sum + category.value, 0);

  return (
    <div className="insights-page">
      {header}
      {monthTabs}

      {loadError && !insights ? <p className="insights-error">{loadError}</p> : null}

      <div className="insights-flow">
        <FlowCard kind="in" label="Money in" loading={!insights} value={month ? money.formatSums(month.totals.in) : null} />
        <FlowCard kind="out" label="Money out" loading={!insights} value={month ? money.formatSums(month.totals.out) : null} />
      </div>

      <button className="insights-analytics-link" disabled={!insights} onClick={() => setView("analytics")} type="button">
        View analytics
        <ChevronRight className="h-4 w-4" />
      </button>

      {insights && selected === "current" ? (
        <button className="insights-card insights-insight" onClick={() => setView("analytics")} type="button">
          <span className={cn("insights-insight-art", spentNow > spentThen ? "is-up" : "is-down")}>
            {spentNow > spentThen ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="insights-card-title">
              {spentNow === 0 ? "No spending yet this month" : "Your spending this month"}
            </span>
            <span className="insights-card-sub">
              {spentNow === 0
                ? "When you send, swap or pay, we'll show how it compares with last month."
                : spentThen === 0
                  ? `You've spent ${money.format(spentNow)} so far, and nothing by this point last month.`
                  : `You've spent ${money.format(spentNow)} so far, ${Math.abs(Math.round(((spentNow - spentThen) / spentThen) * 100))}% ${spentNow > spentThen ? "more" : "less"} than by this point last month.`}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      ) : null}

      {categoriesOut.length > 0 ? (
        <section className="insights-card">
          <h2 className="insights-card-title">Where your money went</h2>
          <ul className="insights-categories">
            {categoriesOut.slice(0, 5).map((category) => {
              const share = totalOut > 0 ? category.value / totalOut : 0;
              return (
                <li key={category.source}>
                  <div className="insights-category-row">
                    <span>{activityFeatureMeta[category.source]?.label ?? "Wallet"}</span>
                    <span className="insights-category-value">
                      {money.format(category.value)}
                      <span>{Math.round(share * 100)}%</span>
                    </span>
                  </div>
                  <div aria-hidden className="insights-category-track">
                    <div className="insights-category-bar" style={{ width: `${Math.max(2, share * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {insights && month && month.totals.count === 0 ? (
        <EmptyState
          body={
            selected === "current"
              ? "Spend or receive money and we'll show you how it moved."
              : "There was no money in or out that month."
          }
          title="Nothing to see yet."
        />
      ) : (
        <section className="insights-transactions">
          <div className="insights-section-head">
            <h2 className="insights-card-title">Transactions</h2>
            {listStartsLate ? (
              <span className="insights-card-sub">
                From {windowStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            ) : null}
          </div>
          <AccountActivity
            hideHeading
            isConnected={isConnected}
            onOpenBatch={(item) => {
              if (address) setBatchReceipt(batchReceiptFrom(item, address));
            }}
            onOpenReceipt={setReceipt}
            ownerWallet={address}
            range={range}
            transfers={transfers}
            transfersError={transfersError}
            transfersLoading={transfersLoading}
            walletExplorerUrl={`${arcChain.blockExplorers.default.url}/address/${address}`}
          />
        </section>
      )}

      <button className="insights-statement-note" onClick={() => setStatementOpen(true)} type="button">
        <FileDown className="h-4 w-4 shrink-0" />
        <span>
          Insights lists the last 30 days. For anything older, <strong>download a statement</strong> for any period.
        </span>
      </button>

      {statement}
      {batchReceipt ? (
        <BatchReceiptModal
          onClose={closeBatchReceipt}
          onDownload={(named) => void downloadBatchReceiptImage(named).catch(() => undefined)}
          onShare={(named) => void shareBatchReceiptImage(named).catch(() => undefined)}
          receipt={batchReceipt}
        />
      ) : null}
      {receipt ? <WalletReceiptModal onClose={closeReceipt} transfer={receipt} walletAddress={address} /> : null}
    </div>
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
        {loading ? (
          <span className="insights-skeleton" />
        ) : (
          <span className="insights-flow-value">{value}</span>
        )}
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
