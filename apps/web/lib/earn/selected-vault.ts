import { arcNetworkTarget } from "@/lib/network";

// Kept per network: a vault picked on testnet does not exist on mainnet, and
// asking App Kit for its position there fails with EARN_VAULT_NOT_FOUND.
export const EARN_SELECTED_VAULT_KEY = `earn_selected_vault:${arcNetworkTarget()}`;
export const EARN_SELECTION_EVENT = "earn-selected-vault";
export const EARN_POSITION_EVENT = "earn-position-updated";

export function readSelectedEarnVault(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(EARN_SELECTED_VAULT_KEY)?.trim();
  return value || null;
}

export function writeSelectedEarnVault(vaultAddress: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EARN_SELECTED_VAULT_KEY, vaultAddress);
  window.dispatchEvent(
    new CustomEvent(EARN_SELECTION_EVENT, { detail: vaultAddress }),
  );
}

export function clearSelectedEarnVault() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(EARN_SELECTED_VAULT_KEY);
  window.dispatchEvent(new CustomEvent(EARN_SELECTION_EVENT, { detail: null }));
}

export function notifyEarnPositionUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EARN_POSITION_EVENT));
}
