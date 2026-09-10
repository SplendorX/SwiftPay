import type { Address } from "viem";

import {
  isArcMainnet,
  officialArcExplorerUrl,
  readContractAddress,
} from "@/lib/network";
import { arcTestnet } from "@/lib/wagmi";

/** Arc Testnet deploy in packages/contracts/deployments/swift-save-arcTestnet.json */
const ARC_TESTNET_SWIFT_SAVE_VAULT =
  "0xcBF3559D59b536cc3aB55C32e502F72Bd111588a" as Address;

export function swiftSaveVaultAddress(): Address | null {
  const configured = readContractAddress(
    process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS,
  );
  if (configured) return configured;
  if (isArcMainnet()) return null;
  return ARC_TESTNET_SWIFT_SAVE_VAULT;
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
