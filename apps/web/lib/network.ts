import type { Address } from "viem";

/**
 * Arc network target for the web app.
 *
 * Testnet is the default while building. Flip to mainnet only after official
 * Arc mainnet chain ID, RPC, explorer, and token addresses are published —
 * never invent those values.
 */
export type ArcNetworkTarget = "testnet" | "mainnet";

function readAddress(value?: string | null): Address | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return null;
  if (/^0x0{40}$/i.test(trimmed)) return null;
  return trimmed as Address;
}

export function arcNetworkTarget(): ArcNetworkTarget {
  return process.env.NEXT_PUBLIC_ARC_NETWORK?.trim().toLowerCase() === "mainnet"
    ? "mainnet"
    : "testnet";
}

export function isArcMainnet() {
  return arcNetworkTarget() === "mainnet";
}

/** Official Arc Testnet USDC (native gas) and EURC. */
export const ARC_TESTNET_USDC =
  "0x3600000000000000000000000000000000000000" as Address;
export const ARC_TESTNET_EURC =
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;

export function officialUsdcAddress(): Address | null {
  const configured = readAddress(
    process.env.NEXT_PUBLIC_USDC_ADDRESS ?? process.env.ARC_MAINNET_USDC,
  );
  if (isArcMainnet()) {
    return configured;
  }
  return configured ?? ARC_TESTNET_USDC;
}

export function officialEurcAddress(): Address | null {
  const configured = readAddress(
    process.env.NEXT_PUBLIC_EURC_ADDRESS ?? process.env.ARC_MAINNET_EURC,
  );
  if (isArcMainnet()) {
    return configured;
  }
  return configured ?? ARC_TESTNET_EURC;
}

export function officialArcExplorerUrl() {
  const configured =
    process.env.NEXT_PUBLIC_ARC_EXPLORER_URL?.trim() ||
    process.env.ARC_MAINNET_EXPLORER?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return isArcMainnet() ? "" : "https://testnet.arcscan.app";
}

export function officialArcRpcUrl() {
  const configured =
    process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() ||
    process.env.ARC_MAINNET_RPC_URL?.trim() ||
    process.env.ARC_TESTNET_RPC_URL?.trim();
  if (configured) {
    return configured;
  }
  return isArcMainnet() ? "" : "https://rpc.testnet.arc.network";
}

export function officialArcChainId(): number | null {
  const raw =
    process.env.NEXT_PUBLIC_ARC_CHAIN_ID?.trim() ||
    process.env.ARC_MAINNET_CHAIN_ID?.trim();
  if (raw) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return isArcMainnet() ? null : 5_042_002;
}

/** Contract addresses are env-only. Never fall back to a testnet deploy. */
export function readContractAddress(value?: string | null): Address | null {
  return readAddress(value);
}
