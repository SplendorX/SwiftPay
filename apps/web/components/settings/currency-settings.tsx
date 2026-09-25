"use client";

import { useMemo } from "react";

import { CurrencyPicker } from "@/components/dashboard/currency-picker";
import { TokenIcon } from "@/components/token-icon";
import { useDisplayCurrency } from "@/lib/display-currency";
import { arcTokenSymbols, arcTokens } from "@/lib/tokens";
import {
  formatConvertedAmount,
  getCurrencyMeta,
  useConversionRates,
  usdPerUnit,
  type ConversionRates,
  type SupportedCurrencyCode,
} from "@/lib/use-conversion-rates";

/**
 * Each Arc stablecoin's peg. USDC tracks USD, EURC tracks EUR, so their rate
 * into the display currency is computed from different bases — showing one
 * number for both would misprice EURC by the EUR/USD spread.
 */
const TOKEN_PEG: Record<string, string> = {
  EURC: "EUR",
  USDC: "USD",
};

function tokenRate(
  symbol: string,
  target: SupportedCurrencyCode,
  rates: ConversionRates | null,
): number | undefined {
  const peg = TOKEN_PEG[symbol];
  if (!peg) return undefined;

  // 1 token -> USD via its peg, then USD -> the display currency.
  const usdValue = usdPerUnit(peg, rates);
  if (usdValue === undefined) return undefined;

  const targetRate = target === "USD" ? 1 : rates?.[target];
  if (targetRate === undefined || !Number.isFinite(targetRate)) {
    return undefined;
  }

  return usdValue * targetRate;
}

function formatUpdatedAt(fetchedAt: number | null) {
  if (!fetchedAt) return null;

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(fetchedAt));
}

export function CurrencySettings() {
  const [currency, setCurrency] = useDisplayCurrency();
  const { error, fetchedAt, isLoading, rates, refresh } = useConversionRates();
  const meta = getCurrencyMeta(currency);

  const tokenRates = useMemo(
    () =>
      arcTokenSymbols.map((symbol) => ({
        rate: tokenRate(symbol, currency, rates),
        symbol,
      })),
    [currency, rates],
  );

  const updatedAt = formatUpdatedAt(fetchedAt);

  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">
          Display currency
        </p>
        <CurrencyPicker
          error={error}
          isLoading={isLoading}
          onChange={setCurrency}
          onRefresh={refresh}
          value={currency}
        />
      </div>

      <div className="rounded-xl border border-border bg-muted/25 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">
            Rates applied to your balances
          </p>
          {updatedAt ? (
            <span className="text-xs text-muted-foreground">
              Updated {updatedAt}
            </span>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          {tokenRates.map(({ rate, symbol }) => (
            <div
              className="flex items-center justify-between gap-3 text-sm"
              key={symbol}
            >
              <span className="flex min-w-0 items-center gap-2">
                <TokenIcon
                  className="h-4 w-4 shrink-0 rounded-full"
                  symbol={symbol}
                />
                <span className="font-medium text-muted-foreground">
                  1 {symbol}
                </span>
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {rate === undefined
                  ? isLoading
                    ? "…"
                    : "n/a"
                  : formatConvertedAmount(rate, currency)}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-2.5 text-xs text-muted-foreground">
          {arcTokens.EURC.symbol} is euro-pegged, so its {meta.code} rate
          is derived through EUR rather than read straight off the USD feed.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        This changes how balances are shown to you only. Payments, swaps, and
        settlement stay denominated in the token being moved.
      </p>
    </div>
  );
}
