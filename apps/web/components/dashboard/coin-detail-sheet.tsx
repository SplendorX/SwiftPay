"use client";

import { ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { formatUnits } from "viem";

import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { arcTokenSymbols, arcTokens, type ArcTokenSymbol } from "@/lib/tokens";
import { cn } from "@/lib/utils";

type Range = "1d" | "1w" | "1m";

type MarketData = {
  symbol: ArcTokenSymbol;
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  fullyDilutedValue: number | null;
  points: [number, number][];
};

const ranges: { id: Range; label: string }[] = [
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "1m", label: "1M" },
];

const compact = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
  notation: "compact",
});

function usd(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

function compactUsd(value: number | null) {
  return value === null ? "—" : `$${compact.format(value)}`;
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function pointTime(timestamp: number, range: Range) {
  return new Date(timestamp).toLocaleString(
    undefined,
    range === "1d"
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: range === "1w" ? "2-digit" : undefined },
  );
}

const chartWidth = 400;
const chartHeight = 150;

/** The price line, scaled to its own range so a stablecoin's small moves show. */
function PriceChart({ points, range }: { points: [number, number][]; range: Range }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const prices = points.map(([, price]) => price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const spread = max - min || max * 0.0001 || 1;
    const start = points[0][0];
    const span = points[points.length - 1][0] - start || 1;
    const xy = points.map(([time, price]) => [
      ((time - start) / span) * chartWidth,
      chartHeight - 8 - ((price - min) / spread) * (chartHeight - 16),
    ]);
    const line = xy.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
    return { area: `${line}L${chartWidth},${chartHeight}L0,${chartHeight}Z`, line, xy };
  }, [points]);

  if (!geometry) {
    return (
      <div className="grid h-40 place-items-center text-xs text-muted-foreground">
        Not enough price history for this range.
      </div>
    );
  }

  function track(event: PointerEvent<SVGSVGElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || !geometry) return;
    const x = ((event.clientX - box.left) / box.width) * chartWidth;
    // Nearest point by x: the series is time-ordered.
    let best = 0;
    for (let index = 1; index < geometry.xy.length; index += 1) {
      if (Math.abs(geometry.xy[index][0] - x) < Math.abs(geometry.xy[best][0] - x)) best = index;
    }
    setHover(best);
  }

  const active = hover === null ? null : geometry.xy[hover];

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-0 top-0 h-5 text-xs tabular-nums text-muted-foreground">
        {hover !== null
          ? `${usd(points[hover][1], 4)} · ${pointTime(points[hover][0], range)}`
          : null}
      </div>
      <svg
        aria-label="Price chart"
        className="coin-chart mt-5 h-40 w-full touch-none"
        onPointerDown={track}
        onPointerLeave={() => setHover(null)}
        onPointerMove={track}
        preserveAspectRatio="none"
        ref={svgRef}
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <defs>
          <linearGradient id="coin-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--token-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--token-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geometry.area} fill="url(#coin-chart-fill)" />
        <path
          d={geometry.line}
          fill="none"
          stroke="var(--token-accent)"
          strokeLinejoin="round"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
        {active ? (
          <>
            <line
              stroke="var(--border)"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              x1={active[0]}
              x2={active[0]}
              y1={0}
              y2={chartHeight}
            />
            <circle cx={active[0]} cy={active[1]} fill="var(--token-accent)" r="3.5" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-2xl border border-border bg-[var(--board-surface)] px-3.5 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-heading text-base font-semibold tabular-nums",
          tone === "up" && "text-emerald-600 dark:text-emerald-400",
          tone === "down" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * A coin's live market picture and the owner's position in it, with Buy and
 * Sell leading straight into Swap with the pair already chosen.
 */
export function CoinDetailSheet({
  hideBalance,
  holdings,
  onOpenChange,
  symbol,
}: {
  hideBalance: boolean;
  /** Raw token units the owner holds, if known. */
  holdings: bigint | undefined;
  onOpenChange: (open: boolean) => void;
  symbol: ArcTokenSymbol | null;
}) {
  const [range, setRange] = useState<Range>("1d");
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  // Switching range or coin shows the last answer instantly while refreshing.
  const cache = useRef(new Map<string, MarketData>());

  useEffect(() => {
    if (!symbol) return;
    const key = `${symbol}:${range}`;
    const cached = cache.current.get(key);
    setData(cached ?? null);
    setError(null);
    setLoading(!cached);

    const controller = new AbortController();
    fetch(`/api/market/${symbol}?range=${range}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message ?? "Market data is unavailable right now.");
        cache.current.set(key, payload as MarketData);
        setData(payload as MarketData);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (!cached) setError(err instanceof Error ? err.message : "Market data is unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, reload, symbol]);

  // Every opening starts on the one-day view.
  function handleOpenChange(open: boolean) {
    if (!open) setRange("1d");
    onOpenChange(open);
  }

  const token = symbol ? arcTokens[symbol] : null;
  const other = symbol ? arcTokenSymbols.find((candidate) => candidate !== symbol) : undefined;
  const amount = token && holdings !== undefined ? Number(formatUnits(holdings, token.decimals)) : null;
  const value = amount !== null && data?.price ? amount * data.price : null;
  const change = data?.change24h ?? null;
  const trend = change === null || change === 0 ? undefined : change > 0 ? "up" : "down";

  return (
    <Sheet onOpenChange={handleOpenChange} open={Boolean(symbol)}>
      <SheetContent
        className={cn(
          "w-full gap-0 overflow-hidden p-0 sm:max-w-md",
          symbol && `token-board-${symbol.toLowerCase()}`,
        )}
        side="right"
      >
        {symbol && token ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="coin-sheet-hero px-5 pb-4 pt-5">
                <div className="flex items-center gap-3 pr-10">
                  <span className="token-board-icon h-12 w-12">
                    <TokenIcon className="h-9 w-9 rounded-full" symbol={symbol} />
                  </span>
                  <div className="min-w-0">
                    <SheetTitle className="font-heading text-lg">{token.name}</SheetTitle>
                    <SheetDescription className="text-xs">{symbol} · Arc</SheetDescription>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-end gap-3">
                  {loading && !data ? (
                    <Skeleton className="h-10 w-36" />
                  ) : (
                    <p className="font-heading text-4xl font-semibold tabular-nums tracking-tight">
                      {usd(data?.price ?? null, 4)}
                    </p>
                  )}
                  {data ? (
                    <span
                      className={cn(
                        "mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                        trend === "up"
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                          : trend === "down"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {trend === "up" ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : trend === "down" ? (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      ) : null}
                      {percent(change)} today
                    </span>
                  ) : null}
                </div>

                <div className="mt-2">
                  {error && !data ? (
                    <div className="grid h-40 place-items-center gap-2 text-center text-sm text-muted-foreground">
                      <div>
                        <p>{error}</p>
                        <Button
                          className="mt-2"
                          onClick={() => setReload((count) => count + 1)}
                          size="sm"
                          variant="outline"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Try again
                        </Button>
                      </div>
                    </div>
                  ) : loading && !data ? (
                    <Skeleton className="mt-5 h-40 w-full" />
                  ) : (
                    <PriceChart points={data?.points ?? []} range={range} />
                  )}
                </div>

                <div
                  aria-label="Chart range"
                  className="mt-4 grid grid-cols-3 gap-1 rounded-full border border-border bg-[var(--board-surface)] p-1"
                  role="tablist"
                >
                  {ranges.map((option) => (
                    <button
                      aria-selected={range === option.id}
                      className={cn(
                        "rounded-full py-1.5 text-xs font-semibold transition",
                        range === option.id
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      key={option.id}
                      onClick={() => setRange(option.id)}
                      role="tab"
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-5 px-5 pb-6 pt-2">
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Your position</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Value" value={hideBalance ? "••••" : usd(value)} />
                    <Stat
                      label="Holdings"
                      value={
                        hideBalance
                          ? "••••"
                          : amount === null
                            ? "—"
                            : `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`
                      }
                    />
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Market stats</h3>
                  {loading && !data ? (
                    <div className="grid grid-cols-2 gap-2">
                      {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton className="h-16 rounded-2xl" key={index} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Stat label="Market cap" value={compactUsd(data?.marketCap ?? null)} />
                      <Stat label="24h volume" value={compactUsd(data?.volume24h ?? null)} />
                      <Stat
                        label="Circulating supply"
                        value={
                          data?.circulatingSupply ? `${compact.format(data.circulatingSupply)} ${symbol}` : "—"
                        }
                      />
                      <Stat
                        label="Total supply"
                        value={data?.totalSupply ? `${compact.format(data.totalSupply)} ${symbol}` : "—"}
                      />
                      <Stat label="Fully diluted value" value={compactUsd(data?.fullyDilutedValue ?? null)} />
                      <Stat label="24h change" tone={trend} value={percent(change)} />
                    </div>
                  )}
                  <p className="mt-2 text-[0.68rem] text-muted-foreground">Market data from CoinGecko.</p>
                </section>
              </div>
            </div>

            {other ? (
              <div className="grid grid-cols-2 gap-2 border-t border-border bg-popover p-4">
                <Button asChild className="h-12 rounded-full text-base">
                  <Link href={`/swap?from=${other}&to=${symbol}`} onClick={() => handleOpenChange(false)}>
                    Buy
                  </Link>
                </Button>
                <Button asChild className="h-12 rounded-full text-base" variant="outline">
                  <Link href={`/swap?from=${symbol}&to=${other}`} onClick={() => handleOpenChange(false)}>
                    Sell
                  </Link>
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
