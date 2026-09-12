"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  createTranslator,
  type Translator,
} from "@/lib/i18n";
import {
  applyAppLocale,
  localeChangedEventName,
  readStoredLocale,
  type AppLocale,
} from "@/lib/locales";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  t: Translator;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");

  useEffect(() => {
    const next = readStoredLocale();
    setLocaleState(next);
    applyAppLocale(next);

    function onChange(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      setLocaleState(readStoredLocale() || (detail as AppLocale));
    }

    window.addEventListener(localeChangedEventName, onChange);
    return () => window.removeEventListener(localeChangedEventName, onChange);
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    const applied = applyAppLocale(next);
    setLocaleState(applied);
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider.");
  }
  return context;
}

export function useT() {
  return useLocale().t;
}
