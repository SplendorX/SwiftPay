const historyStorageKey = "swiftpay.request.username-history.v1";
const maxHistory = 8;

function normalizeStoredUsername(value: string) {
  return value.trim().toLowerCase().replace(/^@+/, "").replace(/\s/g, "");
}

export function readRequestUsernameHistory(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(historyStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set<string>();
    const usernames: string[] = [];

    for (const item of parsed) {
      if (typeof item !== "string") {
        continue;
      }

      const username = normalizeStoredUsername(item);
      if (!username || seen.has(username)) {
        continue;
      }

      seen.add(username);
      usernames.push(username);
    }

    return usernames.slice(0, maxHistory);
  } catch {
    return [];
  }
}

export function rememberRequestedUsername(username: string): string[] {
  const normalized = normalizeStoredUsername(username);
  if (!normalized) {
    return readRequestUsernameHistory();
  }

  const next = [
    normalized,
    ...readRequestUsernameHistory().filter((item) => item !== normalized),
  ].slice(0, maxHistory);

  try {
    window.localStorage.setItem(historyStorageKey, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }

  return next;
}
