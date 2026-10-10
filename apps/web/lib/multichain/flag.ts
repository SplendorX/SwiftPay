/**
 * Multichain receive is off unless NEXT_PUBLIC_MULTICHAIN_ENABLED is "true".
 * Inlined at build time, so a change needs a redeploy. Testnet first, then a
 * mainnet canary (MULTICHAIN_ALLOWED_WALLETS), then everyone.
 */
import { MULTICHAIN_CHAINS, type MultichainChain } from "@/lib/multichain/chains";

export const multichainEnabled = process.env.NEXT_PUBLIC_MULTICHAIN_ENABLED === "true";

/**
 * NEXT_PUBLIC_MULTICHAIN_NETWORKS narrows the networks on offer, as a comma
 * list of keys ("base,polygon"). Unset means every network in the registry.
 */
export function enabledMultichainChains(): MultichainChain[] {
  const raw = process.env.NEXT_PUBLIC_MULTICHAIN_NETWORKS?.trim();
  if (!raw) return [...MULTICHAIN_CHAINS];
  const wanted = new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return MULTICHAIN_CHAINS.filter((chain) => wanted.has(chain.key));
}
