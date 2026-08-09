import type { Address } from "viem";

import { arcTestnet } from "@/lib/wagmi";

export function swiftSaveVaultAddress(): Address | null {
  const value = process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return null;
  }
  return value as Address;
}

export function isSwiftSaveVaultConfigured() {
  return Boolean(swiftSaveVaultAddress());
}

export function explorerTxUrl(txHash: string) {
  const base =
    process.env.NEXT_PUBLIC_ARC_EXPLORER_URL?.trim() ||
    arcTestnet.blockExplorers.default.url;
  return `${base.replace(/\/$/, "")}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string) {
  const base =
    process.env.NEXT_PUBLIC_ARC_EXPLORER_URL?.trim() ||
    arcTestnet.blockExplorers.default.url;
  return `${base.replace(/\/$/, "")}/address/${address}`;
}

export const SWIFT_SAVE_DISCLAIMER =
  "Swift+Save is a non-interest-bearing savings tool. There is no APY, yield, interest, lending, or investment return. Funds stay in your chosen stablecoin and remain segregated from your spendable balance.";
