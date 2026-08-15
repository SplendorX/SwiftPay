import type { Address } from "viem";

import { officialArcExplorerUrl, readContractAddress } from "@/lib/network";
import { arcTestnet } from "@/lib/wagmi";

export function swiftSaveVaultAddress(): Address | null {
  return readContractAddress(
    process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS,
  );
}

export function isSwiftSaveVaultConfigured() {
  return Boolean(swiftSaveVaultAddress());
}

export function explorerTxUrl(txHash: string) {
  const base =
    officialArcExplorerUrl() || arcTestnet.blockExplorers.default.url;
  return `${base.replace(/\/$/, "")}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string) {
  const base =
    officialArcExplorerUrl() || arcTestnet.blockExplorers.default.url;
  return `${base.replace(/\/$/, "")}/address/${address}`;
}

export const SWIFT_SAVE_DISCLAIMER =
  "Swift+Save is a non-interest-bearing savings tool. There is no APY, yield, interest, lending, or investment return. Funds stay in your chosen stablecoin and remain segregated from your spendable balance.";
