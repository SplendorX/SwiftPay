"use client";

import { useCallback, useEffect, useState } from "react";

import {
  isSupportedCurrencyCode,
  type SupportedCurrencyCode,
} from "@/lib/use-conversion-rates";

/**
 * The currency balances are *displayed* in. Purely presentational — it never
 * changes which token a payment moves or what a counterparty receives.
 *
 * Follows the same storage-plus-event shape as the preferred wallet mode, so
 * changing it in Settings reaches an already-mounted dashboard.
 */
export const displayCurrencyEventName = "swiftpay:display-currency";
export const displayCurrencyKey = "swiftpay.display-currency";

export const DEFAULT_DISPLAY_CURRENCY: SupportedCurrencyCode = "USD";

function notifyDisplayCurrencyChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent(displayCurrencyEventName));
  });
}

export function readDisplayCurrency(): SupportedCurrencyCode {
  if (typeof window === "undefined") {
    return DEFAULT_DISPLAY_CURRENCY;
  }

  try {
    const stored = window.localStorage.getItem(displayCurrencyKey);
    return isSupportedCurrencyCode(stored) ? stored : DEFAULT_DISPLAY_CURRENCY;
  } catch {
    // Private mode or blocked storage: the default still renders.
    return DEFAULT_DISPLAY_CURRENCY;
  }
}

export function writeDisplayCurrency(currency: SupportedCurrencyCode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const previous = window.localStorage.getItem(displayCurrencyKey);
    window.localStorage.setItem(displayCurrencyKey, currency);
    if (previous !== currency) {
      notifyDisplayCurrencyChanged();
    }
  } catch {
    // Storage is unavailable; still tell this tab so the UI follows.
    notifyDisplayCurrencyChanged();
  }
}

export function useDisplayCurrency(): [
  SupportedCurrencyCode,
  (next: SupportedCurrencyCode) => void,
] {
  // Start on the default and adopt storage after mount, so the server and the
  // first client render agree.
  const [currency, setCurrency] = useState<SupportedCurrencyCode>(
    DEFAULT_DISPLAY_CURRENCY,
  );

  useEffect(() => {
    const sync = () => setCurrency(readDisplayCurrency());
    sync();

    window.addEventListener(displayCurrencyEventName, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(displayCurrencyEventName, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const select = useCallback((next: SupportedCurrencyCode) => {
    setCurrency(next);
    writeDisplayCurrency(next);
  }, []);

  return [currency, select];
}
