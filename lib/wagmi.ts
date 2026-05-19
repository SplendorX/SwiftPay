import { getDefaultConfig, type Chain } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { baseSepolia, sepolia } from "wagmi/chains";

export const arcTestnet = {
  id: 5_042_002,
  name: "Arc Testnet",
  iconBackground: "#f5efff",
  iconUrl:
    "data:image/svg+xml;utf8,<svg width='64' height='64' viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'><rect width='64' height='64' rx='32' fill='%23f2ecff'/><path d='M18 38c4 6 18 7 24 1 5-5 2-12-8-12h-8c-6 0-8-7-3-11 6-5 18-2 21 5' fill='none' stroke='%235d22c6' stroke-width='5' stroke-linecap='round'/><path d='M33 18l-6 14h8l-5 14 14-20h-8l5-8z' fill='%23713be2'/></svg>",
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

export const config = getDefaultConfig({
  appName: "SwiftPay",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "swiftpay-demo-project",
  chains: [arcTestnet, baseSepolia, sepolia],
  ssr: true,
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
  },
});
