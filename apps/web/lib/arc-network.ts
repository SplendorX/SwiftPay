"use client";

import { arcChain, arcChainRpcUrls } from "@/lib/chains";

/**
 * Everything a wallet needs to add the active Arc network itself. Mobile wallets
 * (MetaMask, Trust…) don't ship with Arc, so a bare "switch" fails there
 * unless the wallet is offered the network to add first.
 */
export const arcAddChainParameter = {
  blockExplorerUrls: [arcChain.blockExplorers.default.url],
  chainName: arcChain.name,
  iconUrls: [arcChain.iconUrl],
  nativeCurrency: arcChain.nativeCurrency,
  rpcUrls: arcChainRpcUrls,
} as const;

/** What to type into a wallet that can't add networks by itself. */
export const arcManualNetworkDetails = `Network name: ${arcChain.name} · RPC URL: ${arcChainRpcUrls[0]} · Chain ID: ${arcChain.id} · Currency: ${arcChain.nativeCurrency.symbol} · Explorer: ${arcChain.blockExplorers.default.url}`;

/**
 * A network-switch failure, already worded for the person. Error formatters
 * pass it through untouched (see userFacingErrorMessage).
 */
export class ArcNetworkError extends Error {
  override name = "ArcNetworkError";
}

function codeOf(error: unknown): number | undefined {
  let current: unknown = error;
  // wagmi wraps provider errors; the EIP-1193 code sits on a cause.
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "number") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function arcSwitchErrorMessage(error: unknown) {
  const code = codeOf(error);
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");

  if (code === 4001 || /user (?:rejected|denied|cancel)|rejected the request|request rejected/i.test(text)) {
    return `You didn't approve switching to ${arcChain.name}. Approve it in your wallet to continue.`;
  }
  if (code === -32002 || /already pending|request already/i.test(text)) {
    return "Your wallet already has a request waiting. Open your wallet app and approve it.";
  }
  if (
    code === 4902 ||
    code === 4200 ||
    /unrecognized chain|not been added|chain.*not (?:configured|supported|added)|unsupported chain|switchChainNotSupported|does not support/i.test(text)
  ) {
    return `Your wallet couldn't add ${arcChain.name} by itself. Add it in your wallet's network settings, then try again — ${arcManualNetworkDetails}.`;
  }
  return `Open your wallet app and approve switching to ${arcChain.name}, then come back here.`;
}

/**
 * Switches the connected wallet to the active Arc network, offering to add the network
 * first when the wallet doesn't know it. Throws an ArcNetworkError whose
 * message says exactly what to do next.
 */
export async function switchToArc(
  switchChainAsync: (args: {
    chainId: number;
    addEthereumChainParameter?: {
      chainName?: string;
      nativeCurrency?: { name: string; symbol: string; decimals: number };
      rpcUrls: readonly string[];
      blockExplorerUrls?: string[];
      iconUrls?: string[];
    };
  }) => Promise<unknown>,
) {
  try {
    await switchChainAsync({
      addEthereumChainParameter: {
        ...arcAddChainParameter,
        blockExplorerUrls: [...arcAddChainParameter.blockExplorerUrls],
        iconUrls: [...arcAddChainParameter.iconUrls],
      },
      chainId: arcChain.id,
    });
  } catch (error) {
    throw new ArcNetworkError(arcSwitchErrorMessage(error));
  }
}
