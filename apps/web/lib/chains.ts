/**
 * Chain definitions, free of wallet-UI code so server routes can import them.
 * (RainbowKit is client-only; keep it in lib/wagmi.ts, never here.)
 */
import { fallback, http, type HttpTransportConfig } from "viem";

import {
  arcRpcUrls,
  isArcMainnet,
  officialArcChainId,
  officialArcExplorerUrl,
  officialArcRpcUrl,
} from "@/lib/network";

export const arcTestnet = {
  id: 5_042_002,
  name: "Arc Testnet",
  iconBackground: "#120b20",
  iconUrl:
    "https://cdn.prod.website-files.com/685311a976e7c248b5dfde95/699e21e934a48439675361dc_arc-icon.svg",
  nativeCurrency: {
    decimals: 18,
    name: "USDC",
    symbol: "USDC",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
    public: {
      http: ["https://rpc.testnet.arc.network"],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
} as const;

const mainnetChainId = officialArcChainId();
const mainnetRpc = officialArcRpcUrl();
const mainnetExplorer = officialArcExplorerUrl();

/** Present only after official Arc mainnet chain ID, RPC, and explorer are published. */
export const arcMainnet =
  isArcMainnet() && mainnetChainId && mainnetRpc && mainnetExplorer
    ? ({
        id: mainnetChainId,
        name: "Arc",
        iconBackground: "#120b20",
        iconUrl:
          "https://cdn.prod.website-files.com/685311a976e7c248b5dfde95/699e21e934a48439675361dc_arc-icon.svg",
        nativeCurrency: {
          decimals: 18,
          name: "USDC",
          symbol: "USDC",
        },
        rpcUrls: {
          default: {
            http: [mainnetRpc],
          },
          public: {
            http: [mainnetRpc],
          },
        },
        blockExplorers: {
          default: {
            name: "ArcScan",
            url: mainnetExplorer,
          },
        },
        testnet: false,
      } as const)
    : null;

/**
 * The Arc chain SaphraONE runs on, chosen by NEXT_PUBLIC_ARC_NETWORK. Use this
 * everywhere instead of `arcTestnet`. Mainnet with missing chain ID, RPC or
 * explorer settings fails loudly rather than quietly running on testnet.
 */
export const arcChain = resolveArcChain();

function resolveArcChain() {
  if (!isArcMainnet()) {
    return arcTestnet;
  }
  if (!arcMainnet) {
    throw new Error(
      "NEXT_PUBLIC_ARC_NETWORK=mainnet requires NEXT_PUBLIC_ARC_CHAIN_ID, NEXT_PUBLIC_ARC_RPC_URL and NEXT_PUBLIC_ARC_EXPLORER_URL.",
    );
  }
  return arcMainnet;
}

/** Every RPC for the active chain, main one first (see arcRpcUrls). */
export const arcChainRpcUrls = arcRpcUrls();

/**
 * The transport for reading Arc: the main RPC, falling over to the backups
 * when it fails. Use this instead of `http(<one url>)`. `primary` puts a
 * dedicated endpoint (e.g. ARC_SERVER_RPC_URL) in front of the list.
 */
export function arcTransport({
  primary,
  ...options
}: HttpTransportConfig & { primary?: string } = {}) {
  const urls = [...new Set([primary, ...arcChainRpcUrls].filter(Boolean))] as string[];
  return fallback(urls.map((url) => http(url, options)));
}

/**
 * POST a JSON-RPC body to Arc, trying each RPC in turn until one answers.
 * For the few places that call the RPC with fetch instead of viem.
 */
export async function postArcRpc(body: unknown): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (const url of arcChainRpcUrls) {
    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (response.ok) return response;
      lastResponse = response;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("No Arc RPC is configured.");
}

/** Block explorer base URL for the active chain, without a trailing slash. */
export const arcExplorerUrl = arcChain.blockExplorers.default.url;

/** Circle's blockchain identifier for the active chain. */
export const arcCircleBlockchain = isArcMainnet() ? "ARC" : "ARC-TESTNET";
