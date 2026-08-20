import { readCircleLogin } from "@/lib/circle-session";

export type WalletMode = "circle" | "external";

export const walletModeEventName = "swiftpay:wallet-mode";
export const preferredWalletModeKey = "swiftpay.wallet.preferredMode";

function notifyWalletModeChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent(walletModeEventName));
  });
}

export function readPreferredWalletMode(): WalletMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(preferredWalletModeKey);

  if (stored === "circle" || stored === "external") {
    return stored;
  }

  return null;
}

export function writePreferredWalletMode(mode: WalletMode) {
  if (typeof window === "undefined") {
    return;
  }

  const previous = window.localStorage.getItem(preferredWalletModeKey);
  window.localStorage.setItem(preferredWalletModeKey, mode);

  if (previous !== mode) {
    notifyWalletModeChanged();
  }
}

export function resolvePlatformWalletMode(): WalletMode {
  const preferred = readPreferredWalletMode();

  if (preferred === "external") {
    return "external";
  }

  if (preferred === "circle") {
    return readCircleLogin() ? "circle" : "external";
  }

  return readCircleLogin() ? "circle" : "external";
}
