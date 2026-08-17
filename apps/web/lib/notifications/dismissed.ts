const storagePrefix = "swiftpay.alert.dismissed.";

function storageKey(ownerWallet: string) {
  return `${storagePrefix}${ownerWallet.toLowerCase()}`;
}

export function readDismissedAlertHashes(ownerWallet: string) {
  if (typeof window === "undefined" || !ownerWallet) {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey(ownerWallet));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        )
      : [];
  } catch {
    return [] as string[];
  }
}

export function rememberDismissedAlertHashes(
  ownerWallet: string,
  hashes: Array<string | null | undefined>,
) {
  if (typeof window === "undefined" || !ownerWallet) {
    return;
  }

  const next = Array.from(
    new Set([
      ...readDismissedAlertHashes(ownerWallet),
      ...hashes
        .map((hash) => hash?.trim().toLowerCase())
        .filter((hash): hash is string => Boolean(hash)),
    ]),
  ).slice(0, 400);

  window.localStorage.setItem(storageKey(ownerWallet), JSON.stringify(next));
}

export function isAlertHashDismissed(ownerWallet: string, hash?: string | null) {
  if (!hash) {
    return false;
  }
  return readDismissedAlertHashes(ownerWallet).includes(hash.toLowerCase());
}
