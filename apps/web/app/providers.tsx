"use client";

import { ServiceWorkerRegistrar } from "@/components/pwa/install-app";
import { WalletChainSync } from "@/components/wallet-chain-sync";
import "@rainbow-me/rainbowkit/styles.css";

import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider } from "wagmi";

import { AccountProvider } from "@/components/account/account-provider";
import { AllieLauncher } from "@/components/allie/AllieLauncher";
import { WorkspaceProvider } from "@/components/business/workspace-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { PlatformAccessProvider } from "@/components/platform-access-gate";
import { SingleWalletGuard } from "@/components/single-wallet-guard";
import { SuccessPopupHost } from "@/components/success-popup";
import { WalletDisconnectRedirect } from "@/components/wallet-disconnect-redirect";
import { WalletSessionBootstrap } from "@/components/wallet-session-bootstrap";
import { arcChain, config } from "@/lib/wagmi";

const rainbowTheme = lightTheme({
  accentColor: "#5d22c6",
  borderRadius: "large",
  fontStack: "system",
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
        <RainbowKitProvider
          appInfo={{ appName: "SwiftPay" }}
          initialChain={arcChain}
          modalSize="compact"
          theme={rainbowTheme}
        >
          <LocaleProvider>
            <PlatformAccessProvider>
              <WorkspaceProvider>
                <AccountProvider>
                  <SingleWalletGuard />
                  <WalletSessionBootstrap />
                  <WalletDisconnectRedirect />
                  {children}
                  <AllieLauncher />
                  <ServiceWorkerRegistrar />
                  <WalletChainSync />
                  <SuccessPopupHost />
                </AccountProvider>
              </WorkspaceProvider>
            </PlatformAccessProvider>
          </LocaleProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}