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

/**
 * OKX Wallet on phones. RainbowKit deep-links OKX with `okex://` on iOS and
 * hands Android the bare `wc:` link (which opens another wallet). Current OKX
 * apps answer to `okxwallet://` (OKX's second entry in the WalletConnect
 * registry, confirmed on a user's phone), so tapping OKX did nothing. Use it on
 * both platforms, formatted as Reown AppKit formats native links.
 */
export const OKX_APP_LINK = "okxwallet://main";

const okxWalletMobileLink: typeof okxWallet = (params) => {
  const wallet = okxWallet(params);
  if (!wallet.mobile?.getUri) return wallet;
  return {
    ...wallet,
    mobile: {
      ...wallet.mobile,
      getUri: (uri: string) => `${OKX_APP_LINK}/wc?uri=${encodeURIComponent(uri)}`,
    },
  };
};

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
  // Every chain in `networks` needs a transport: WalletConnect reads one per
  // chain and crashes on a missing entry, so connecting a wallet did nothing.
  // Built from the list itself so the two cannot drift apart again.
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    ...Object.fromEntries(
      networks.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
    ),
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
      wallets: [rainbowWallet, trustWallet, okxWalletMobileLink, injectedWallet],
    },
  ],
}) as Config;
