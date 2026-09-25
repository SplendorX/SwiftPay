import type { Address } from "viem";

import {
  arcNetworkTarget,
  isArcMainnet,
  officialArcChainId,
  officialArcExplorerUrl,
  officialArcRpcUrl,
  officialEurcAddress,
  officialUsdcAddress,
} from "@/lib/network";
import { arcTokens } from "@/lib/tokens";
import { arcChain } from "@/lib/chains";

/**
 * SwiftPay onchain source of truth.
 *
 * Chain IDs, RPC URLs, explorer URLs, and token addresses come from the
 * existing network configuration. Do not hardcode those values at call sites.
 */
export const onchainFacts = {
  network: arcNetworkTarget(),
  isMainnet: isArcMainnet(),
  chainId: officialArcChainId() ?? arcChain.id,
  rpcUrl: officialArcRpcUrl() || arcChain.rpcUrls.default.http[0],
  explorerUrl:
    officialArcExplorerUrl() || arcChain.blockExplorers.default.url,
  usdcAddress: officialUsdcAddress(),
  eurcAddress: officialEurcAddress(),
  tokens: arcTokens,
  chain: arcChain,
} as const;

export type EarnAppKitChain = "Arc" | "Arc_Testnet";

/** App Kit Earn runs on whichever Arc network the app is configured for. */
export function earnAppKitChain(): EarnAppKitChain {
  return isArcMainnet() ? "Arc" : "Arc_Testnet";
}

export function explorerTxUrl(txHash: string): string {
  const hash = txHash.trim();
  if (!hash) return onchainFacts.explorerUrl;
  return `${onchainFacts.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  const value = address.trim();
  if (!value) return onchainFacts.explorerUrl;
  return `${onchainFacts.explorerUrl.replace(/\/$/, "")}/address/${value}`;
}

export function isHexAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}
