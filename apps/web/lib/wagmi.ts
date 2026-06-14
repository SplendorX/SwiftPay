import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  baseSepolia,
  sepolia,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { coinbaseWallet } from "@wagmi/connectors";
import { http, type Config } from "wagmi";

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

const configuredProjectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim() ||
  process.env.NEXT_PUBLIC_PROJECT_ID?.trim() ||
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const invalidProjectIds = new Set([
  "swiftpay-demo-project",
  "YOUR_PROJECT_ID",
]);

export const projectId =
  configuredProjectId && !invalidProjectIds.has(configuredProjectId)
    ? configuredProjectId
    : "b56e18d47c72ab683b10814fe9495694";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

export const metadata = {
  description:
    "A stablecoin payment platform for USDC and EURC transfers, receiving, swaps, and ArcScan receipts.",
  icons: [`${appUrl}/tokens/usdc.svg`],
  name: "SwiftPay",
  url: appUrl,
};

export const networks = [
  arcTestnet,
  baseSepolia,
  sepolia,
] as [AppKitNetwork, ...AppKitNetwork[]];

export const wagmiAdapter = new WagmiAdapter({
  connectors: [
    coinbaseWallet({
      preference: {
        options: "all",
        telemetry: false,
      },
    }),
  ],
  networks,
  projectId,
  ssr: true,
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
  },
});

export const config = wagmiAdapter.wagmiConfig as Config;
