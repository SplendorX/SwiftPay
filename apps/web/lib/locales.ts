export type AppLocale =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "ar"
  | "zh"
  | "ja"
  | "ko";

export const APP_LOCALES: Array<{
  id: AppLocale;
  english: string;
  native: string;
  dir: "ltr" | "rtl";
}> = [
  { id: "en", english: "English", native: "English", dir: "ltr" },
  { id: "es", english: "Spanish", native: "Español", dir: "ltr" },
  { id: "fr", english: "French", native: "Français", dir: "ltr" },
  { id: "de", english: "German", native: "Deutsch", dir: "ltr" },
  { id: "pt", english: "Portuguese", native: "Português", dir: "ltr" },
  { id: "ar", english: "Arabic", native: "العربية", dir: "rtl" },
  { id: "zh", english: "Chinese", native: "中文", dir: "ltr" },
  { id: "ja", english: "Japanese", native: "日本語", dir: "ltr" },
  { id: "ko", english: "Korean", native: "한국어", dir: "ltr" },
];

export const localeStorageKey = "swiftpay.locale";
export const localeChangedEventName = "swiftpay:locale-changed";

export function isAppLocale(value: string): value is AppLocale {
  return APP_LOCALES.some((locale) => locale.id === value);
}

export function resolveAppLocale(value: string | null | undefined): AppLocale {
  return value && isAppLocale(value) ? value : "en";
}

export function applyAppLocale(value: string) {
  const locale = resolveAppLocale(value);
  const match = APP_LOCALES.find((item) => item.id === locale)!;
  if (typeof document === "undefined") return match.id;
  document.documentElement.lang = match.id;
  document.documentElement.dir = match.dir;
  window.localStorage.setItem(localeStorageKey, match.id);
  window.dispatchEvent(
    new CustomEvent(localeChangedEventName, { detail: match.id }),
  );
  return match.id;
}

export function readStoredLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  return resolveAppLocale(window.localStorage.getItem(localeStorageKey));
}
