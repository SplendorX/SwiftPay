import {
  getDefaultConfig,
  type Chain,
  type WalletList,
} from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  okxWallet,
  rabbyWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createStorage, http } from "wagmi";
import { baseSepolia, sepolia } from "wagmi/chains";

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
} as const satisfies Chain;

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const invalidWalletConnectProjectIds = new Set([
  "swiftpay-demo-project",
  "YOUR_PROJECT_ID",
]);

if (
  !walletConnectProjectId ||
  invalidWalletConnectProjectIds.has(walletConnectProjectId)
) {
  throw new Error(
    "Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to a valid Reown/WalletConnect project ID.",
  );
}

const appName = "SwiftPay";
const appDescription =
  "A stablecoin payment platform for EURC and USDC transfers, receiving, swaps, and ArcScan receipts.";
const appUrl =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_APP_URL?.trim()
    : window.location.origin;

const wallets = [
  {
    groupName: "Recommended",
    wallets: [injectedWallet, okxWallet, rabbyWallet, walletConnectWallet],
  },
] satisfies WalletList;

const storage = createStorage({
  key: "swiftpay2-wagmi-v2",
  storage: {
    getItem(key) {
      if (typeof window === "undefined") {
        return null;
      }

      return window.localStorage.getItem(key);
    },
    removeItem(key) {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.removeItem(key);
    },
    setItem(key, value) {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(key, value);
    },
  },
});

export const config = getDefaultConfig({
  appName,
  appDescription,
  appUrl,
  projectId: walletConnectProjectId,
  storage,
  wallets,
  walletConnectParameters: {
    storageOptions: {
      database: "swiftpay2-walletconnect",
    },
  },
  chains: [arcTestnet, baseSepolia, sepolia],
  ssr: true,
  // Some browser extensions announce duplicate EIP-6963 ids like app.keplr.
  // Use the explicit RainbowKit wallet list to avoid duplicate React keys.
  multiInjectedProviderDiscovery: false,
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
  },
});
