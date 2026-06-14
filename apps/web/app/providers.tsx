"use client";

import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider } from "wagmi";

import {
  arcTestnet,
  config,
  metadata,
  networks,
  projectId,
  wagmiAdapter,
} from "@/lib/wagmi";

createAppKit({
  adapters: [wagmiAdapter],
  chainImages: {
    [arcTestnet.id]: arcTestnet.iconUrl,
  },
  defaultNetwork: arcTestnet,
  features: {
    allWallets: true,
    analytics: false,
    email: false,
    onramp: false,
    socials: false,
    swaps: false,
  },
  metadata,
  networks,
  projectId,
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#5d22c6",
    "--w3m-border-radius-master": "2px",
  },
});

export function Providers({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies?: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const initialState = cookieToInitialState(config, cookies ?? null);

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
