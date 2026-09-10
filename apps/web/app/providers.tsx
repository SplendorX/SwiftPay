"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider } from "wagmi";

import { PlatformAccessProvider } from "@/components/platform-access-gate";
import { SuccessPopupHost } from "@/components/success-popup";
import { WalletDisconnectRedirect } from "@/components/wallet-disconnect-redirect";
import { WalletSessionBootstrap } from "@/components/wallet-session-bootstrap";
import { ensureAppKitInitialized } from "@/lib/appkit";
import { applyAppLocale, readStoredLocale } from "@/lib/locales";
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
    applyAppLocale(readStoredLocale());
  }, []);

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <PlatformAccessProvider>
          <WalletSessionBootstrap />
          <WalletDisconnectRedirect />
          {children}
          <SuccessPopupHost />
        </PlatformAccessProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}