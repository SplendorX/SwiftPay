/**
 * Chain definitions, free of wallet-UI code so server routes can import them.
 * (RainbowKit is client-only; keep it in lib/wagmi.ts, never here.)
 */
import {
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
 * The Arc chain SwiftPay runs on, chosen by NEXT_PUBLIC_ARC_NETWORK. Use this
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

/** Block explorer base URL for the active chain, without a trailing slash. */
export const arcExplorerUrl = arcChain.blockExplorers.default.url;

/** Circle's blockchain identifier for the active chain. */
export const arcCircleBlockchain = isArcMainnet() ? "ARC" : "ARC-TESTNET";
