"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Live USD-based FX rates for display conversion only.
 *
 * These rates format what a balance is worth in the reader's currency. They
 * never price a payment, a swap, or a settlement — those stay denominated in
 * the token actually being moved.
 */
const RATES_ENDPOINT = "https://open.er-api.com/v6/latest/USD";
const CACHE_TTL_MS = 10 * 60 * 1_000;

export type SupportedCurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CAD"
  | "AUD"
  | "CHF"
  | "NGN"
  | "BRL"
  | "INR";

export type CurrencyMeta = {
  code: SupportedCurrencyCode;
  name: string;
  symbol: string;
};

export const SUPPORTED_CURRENCIES: readonly CurrencyMeta[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
];

const CURRENCY_BY_CODE = new Map<string, CurrencyMeta>(
  SUPPORTED_CURRENCIES.map((entry) => [entry.code, entry]),
);

export function isSupportedCurrencyCode(
  value: unknown,
): value is SupportedCurrencyCode {
  return typeof value === "string" && CURRENCY_BY_CODE.has(value);
}

export function getCurrencyMeta(code: string): CurrencyMeta {
  return CURRENCY_BY_CODE.get(code) ?? SUPPORTED_CURRENCIES[0];
}

export type ConversionRates = Record<string, number>;

export type ConversionRatesState = {
  error: string | null;
  fetchedAt: number | null;
  isLoading: boolean;
  rates: ConversionRates | null;
  refresh: () => void;
};

type RatesSnapshot = {
  fetchedAt: number;
  rates: ConversionRates;
};

// Module-level so every mounted consumer shares one fetch and one result.
let cachedSnapshot: RatesSnapshot | null = null;
let inFlight: Promise<RatesSnapshot> | null = null;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const listener of subscribers) {
    listener();
  }
}

function isFresh(snapshot: RatesSnapshot | null): snapshot is RatesSnapshot {
  return snapshot !== null && Date.now() - snapshot.fetchedAt < CACHE_TTL_MS;
}

async function requestRates(): Promise<RatesSnapshot> {
  const response = await fetch(RATES_ENDPOINT, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Rate service responded ${response.status}.`);
  }

  const payload = (await response.json()) as {
    rates?: Record<string, unknown>;
    result?: string;
  };

  if (payload.result === "error" || !payload.rates) {
    throw new Error("Rate service returned no rates.");
  }

  const rates: ConversionRates = {};
  for (const [code, value] of Object.entries(payload.rates)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }

  if (rates.USD === undefined) {
    // The feed is USD-based, so USD is 1 by definition even if it is omitted.
    rates.USD = 1;
  }

  return { fetchedAt: Date.now(), rates };
}

/**
 * Fetch rates, reusing a fresh cache and collapsing concurrent callers onto a
 * single in-flight request.
 */
function loadRates(force = false): Promise<RatesSnapshot> {
  if (!force && isFresh(cachedSnapshot)) {
    return Promise.resolve(cachedSnapshot);
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = requestRates()
    .then((snapshot) => {
      cachedSnapshot = snapshot;
      notifySubscribers();
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function useConversionRates(): ConversionRatesState {
  const [rates, setRates] = useState<ConversionRates | null>(
    () => cachedSnapshot?.rates ?? null,
  );
  const [fetchedAt, setFetchedAt] = useState<number | null>(
    () => cachedSnapshot?.fetchedAt ?? null,
  );
  const [isLoading, setIsLoading] = useState(() => !isFresh(cachedSnapshot));
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((force: boolean) => {
    let active = true;
    setIsLoading(true);

    loadRates(force)
      .then((snapshot) => {
        if (!active) return;
        setRates(snapshot.rates);
        setFetchedAt(snapshot.fetchedAt);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load conversion rates.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => run(false), [run]);

  // Adopt results another consumer fetched, so one mount warms them all.
  useEffect(() => {
    const listener = () => {
      if (!cachedSnapshot) return;
      setRates(cachedSnapshot.rates);
      setFetchedAt(cachedSnapshot.fetchedAt);
      setError(null);
    };
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => {
    run(true);
  }, [run]);

  return { error, fetchedAt, isLoading, rates, refresh };
}

/** Convert a USD amount into `targetCurrency`. Undefined when unconvertible. */
export function convertFromUsd(
  usdAmount: number | undefined | null,
  targetCurrency: string,
  rates: ConversionRates | null | undefined,
): number | undefined {
  if (
    usdAmount === undefined ||
    usdAmount === null ||
    !Number.isFinite(usdAmount)
  ) {
    return undefined;
  }

  if (targetCurrency === "USD") {
    return usdAmount;
  }

  const rate = rates?.[targetCurrency];
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    return undefined;
  }

  return usdAmount * rate;
}

/**
 * The USD value of one unit of a currency — the inverse of its USD rate.
 * EURC is EUR-pegged, so its USD worth comes from here rather than from 1:1.
 */
export function usdPerUnit(
  currency: string,
  rates: ConversionRates | null | undefined,
): number | undefined {
  if (currency === "USD") {
    return 1;
  }

  const rate = rates?.[currency];
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    return undefined;
  }

  return 1 / rate;
}

export function formatConvertedAmount(
  amount: number | undefined | null,
  currencyCode: string,
): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) {
    return "n/a";
  }

  // Zero-decimal currencies read wrong with forced cents.
  const fractionDigits = currencyCode === "JPY" ? 0 : 2;

  try {
    return new Intl.NumberFormat(undefined, {
      currency: currencyCode,
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
      style: "currency",
    }).format(amount);
  } catch {
    // An unknown ISO code makes Intl throw; fall back to a plain number.
    return `${getCurrencyMeta(currencyCode).symbol}${amount.toFixed(fractionDigits)}`;
  }
}

export function formatSignedConvertedAmount(
  amount: number | undefined | null,
  currencyCode: string,
): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) {
    return "n/a";
  }

  if (amount === 0) {
    return formatConvertedAmount(0, currencyCode);
  }

  return `${amount > 0 ? "+" : "-"}${formatConvertedAmount(Math.abs(amount), currencyCode)}`;
}
