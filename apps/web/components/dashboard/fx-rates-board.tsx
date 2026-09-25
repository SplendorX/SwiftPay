"use client";

import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import {
  SUPPORTED_CURRENCIES,
  useConversionRates,
  type ConversionRates,
} from "@/lib/use-conversion-rates";

type Stablecoin = "USDC" | "EURC";

/** Each stablecoin is shown at its peg: USDC = 1 USD, EURC = 1 EUR. */
const pegOf: Record<Stablecoin, string> = { EURC: "EUR", USDC: "USD" };

/** Units of `quote` for one unit of `base`, from a USD-based rate table. */
function cross(rates: ConversionRates, base: string, quote: string) {
  const perUsdBase = rates[base];
  const perUsdQuote = rates[quote];
  if (!perUsdBase || !perUsdQuote) return null;
  return perUsdQuote / perUsdBase;
}

function formatRate(value: number) {
  const digits = value >= 100 ? 2 : value >= 10 ? 3 : 4;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function updatedLabel(fetchedAt: number | null, now: number) {
  if (!fetchedAt) return "Waiting for rates";
  const minutes = Math.floor((now - fetchedAt) / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 min ago";
  return `Updated ${minutes} min ago`;
}

/** Reference FX rates for SwiftPay's two stablecoins against major currencies. */
export function FxRatesBoard() {
  const { error, fetchedAt, isLoading, rates, refresh } = useConversionRates();
  const [base, setBase] = useState<Stablecoin>("USDC");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const other: Stablecoin = base === "USDC" ? "EURC" : "USDC";
  const basePeg = pegOf[base];
  const headline = rates ? cross(rates, basePeg, pegOf[other]) : null;
  const rows = SUPPORTED_CURRENCIES.filter(
    (currency) => currency.code !== basePeg && currency.code !== pegOf[other],
  ).map((currency) => {
    const rate = rates ? cross(rates, basePeg, currency.code) : null;
    return { ...currency, inverse: rate ? 1 / rate : null, rate };
  });

  return (
    <section aria-labelledby="fx-board-title" className="fx-board board-edge">
      <header className="fx-board-head">
        <div>
          <p className="fx-board-eyebrow">Markets</p>
          <h2 className="fx-board-title" id="fx-board-title">
            FX rates
          </h2>
        </div>
        <div aria-label="Base stablecoin" className="fx-board-toggle" role="group">
          {(["USDC", "EURC"] as const).map((coin) => (
            <button
              aria-pressed={base === coin}
              key={coin}
              onClick={() => setBase(coin)}
              type="button"
            >
              {coin}
            </button>
          ))}
        </div>
      </header>

      <div className="fx-board-hero">
        <p className="fx-board-pair">
          <span>1 {base}</span>
          <ArrowLeftRight aria-hidden className="h-3.5 w-3.5" />
          <span>{other}</span>
        </p>
        <p className="fx-board-hero-rate">
          {headline ? formatRate(headline) : "—"}
          <span>{other}</span>
        </p>
        <p className="fx-board-hero-note">
          {headline
            ? `1 ${other} = ${formatRate(1 / headline)} ${base}`
            : isLoading
              ? "Loading rates"
              : "Rates unavailable"}
        </p>
      </div>

      <ul className="fx-board-list">
        {rows.map((row) => (
          <li className="fx-board-row" key={row.code}>
            <span aria-hidden className="fx-board-symbol">
              {row.symbol}
            </span>
            <span className="fx-board-name">
              <strong>
                {base}/{row.code}
              </strong>
              <small>{row.name}</small>
            </span>
            <span className="fx-board-value">
              <strong>{row.rate ? formatRate(row.rate) : "—"}</strong>
              <small>
                {row.inverse ? `1 ${row.code} = ${formatRate(row.inverse)} ${base}` : " "}
              </small>
            </span>
          </li>
        ))}
      </ul>

      <footer className="fx-board-foot">
        <span>
          {error && !rates ? "Rates could not load" : updatedLabel(fetchedAt, now)}
          {" · "}Mid-market reference, stablecoins at peg
        </span>
        <button
          aria-label="Refresh rates"
          className="fx-board-refresh"
          disabled={isLoading}
          onClick={refresh}
          type="button"
        >
          <RefreshCw className={isLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        </button>
      </footer>
    </section>
  );
}
