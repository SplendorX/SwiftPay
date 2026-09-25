import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import {
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
} from "viem/chains";
import type { Chain } from "viem";
import { cookieStorage, createStorage, http, type Config } from "wagmi";

import { arcChain, arcMainnet, arcTestnet } from "@/lib/chains";

// Re-exported so existing imports keep working; server code should import
// these from "@/lib/chains" to avoid loading RainbowKit.
export { arcChain, arcMainnet, arcTestnet };

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
  icons: [`${appUrl}/brand/swiftpay-mark.png`],
  name: "SwiftPay",
  url: appUrl,
};

export const networks = (
  arcMainnet
    ? [arcMainnet, base, mainnet, arbitrum, optimism, avalanche, polygon]
    : [
        arcTestnet,
        baseSepolia,
        sepolia,
        arbitrumSepolia,
        optimismSepolia,
        avalancheFuji,
        polygonAmoy,
      ]
) as unknown as readonly [Chain, ...Chain[]];

/**
 * RainbowKit's wallet list. Wallets installed in the browser are detected and
 * listed first on their own; on a phone, picking a wallet deep-links straight
 * into its app to approve the connection and signatures.
 */
export const config = getDefaultConfig({
  appDescription: metadata.description,
  appIcon: metadata.icons[0],
  appName: metadata.name,
  appUrl: metadata.url,
  chains: networks,
  projectId,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    ...(arcMainnet
      ? { [arcMainnet.id]: http(arcMainnet.rpcUrls.default.http[0]) }
      : {
          [baseSepolia.id]: http(),
          [sepolia.id]: http(),
          [arbitrumSepolia.id]: http(),
          [optimismSepolia.id]: http(),
          [avalancheFuji.id]: http(),
          [polygonAmoy.id]: http(),
        }),
  },
  wallets: [
    {
      groupName: "Recommended",
      wallets: [
        metaMaskWallet,
        rabbyWallet,
        coinbaseWallet,
        walletConnectWallet,
      ],
    },
    {
      groupName: "More",
      wallets: [rainbowWallet, trustWallet, okxWallet, injectedWallet],
    },
  ],
}) as Config;
