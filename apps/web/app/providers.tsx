"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider } from "wagmi";

import { PlatformAccessProvider } from "@/components/platform-access-gate";
import { WalletSessionBootstrap } from "@/components/wallet-session-bootstrap";
import { ensureAppKitInitialized } from "@/lib/appkit";
import { config } from "@/lib/wagmi";

export function Providers({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies?: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const initialState = cookieToInitialState(config, cookies ?? null);

  useEffect(() => {
    void ensureAppKitInitialized();
  }, []);

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <PlatformAccessProvider>
          <WalletSessionBootstrap />
          {children}
        </PlatformAccessProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}