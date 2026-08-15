export const alertPreferenceStorageKey = "swiftpay.alert.preferences.v1";
export const alertPreferencesChangedEvent = "swiftpay:alert-preferences";

export const alertCategories = [
  "payments",
  "requests",
  "savings",
  "claims",
] as const;

export type AlertCategory = (typeof alertCategories)[number];

export type AlertPreferences = {
  toasts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  categories: Record<AlertCategory, boolean>;
};

export const defaultAlertPreferences: AlertPreferences = {
  toasts: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  categories: {
    payments: true,
    requests: true,
    savings: true,
    claims: true,
  },
};

function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

export function normalizeAlertPreferences(
  value: unknown,
): AlertPreferences {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<AlertPreferences>)
      : {};
  const categories = raw.categories ?? defaultAlertPreferences.categories;

  return {
    toasts: raw.toasts !== false,
    quietHoursEnabled: raw.quietHoursEnabled === true,
    quietHoursStart: isTimeString(raw.quietHoursStart)
      ? raw.quietHoursStart
      : defaultAlertPreferences.quietHoursStart,
    quietHoursEnd: isTimeString(raw.quietHoursEnd)
      ? raw.quietHoursEnd
      : defaultAlertPreferences.quietHoursEnd,
    categories: {
      payments: categories.payments !== false,
      requests: categories.requests !== false,
      savings: categories.savings !== false,
      claims: categories.claims !== false,
    },
  };
}

export function readAlertPreferences(): AlertPreferences {
  if (typeof window === "undefined") {
    return defaultAlertPreferences;
  }

  try {
    const stored = window.localStorage.getItem(alertPreferenceStorageKey);
    if (!stored) return defaultAlertPreferences;
    return normalizeAlertPreferences(JSON.parse(stored));
  } catch {
    return defaultAlertPreferences;
  }
}

export function writeAlertPreferences(next: AlertPreferences) {
  const normalized = normalizeAlertPreferences(next);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      alertPreferenceStorageKey,
      JSON.stringify(normalized),
    );
    window.dispatchEvent(new Event(alertPreferencesChangedEvent));
  }
  return normalized;
}

export function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isWithinQuietHours(
  prefs: AlertPreferences,
  now = new Date(),
) {
  if (!prefs.quietHoursEnabled) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesFromTime(prefs.quietHoursStart);
  const end = minutesFromTime(prefs.quietHoursEnd);
  if (start === end) return true;
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

export function shouldShowAlertToast(
  prefs: AlertPreferences,
  category: AlertCategory,
  now = new Date(),
) {
  if (!prefs.toasts) return false;
  if (!prefs.categories[category]) return false;
  if (isWithinQuietHours(prefs, now)) return false;
  return true;
}
