"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertCircle, ChevronDown, Wallet } from "lucide-react";

export function WalletConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const connected = mounted && account && chain;

        return (
          <div
            aria-hidden={!mounted}
            className={!mounted ? "pointer-events-none opacity-0" : ""}
          >
            {!connected ? (
              <button
                type="button"
                onClick={openConnectModal}
                className="font-ui inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-swift-600 to-swift-700 px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(66,17,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(66,17,143,0.34)] active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2"
              >
                <Wallet className="h-4 w-4" />
                Connect
              </button>
            ) : chain.unsupported ? (
              <button
                type="button"
                onClick={openChainModal}
                className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(225,29,72,0.2)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-2"
              >
                <AlertCircle className="h-4 w-4" />
                Wrong network
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openChainModal}
                  className="font-ui hidden h-10 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-3 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-swift-700 hover:text-white active:translate-y-0 sm:inline-flex"
                >
                  {chain.hasIcon && chain.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={chain.name ?? "Network"}
                      className="h-4 w-4 rounded-full"
                      src={chain.iconUrl}
                    />
                  ) : null}
                  {chain.name}
                  <ChevronDown className="h-3.5 w-3.5 text-muted" />
                </button>
                <button
                  type="button"
                  onClick={openAccountModal}
                  className="font-ui inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(18,11,32,0.18)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                >
                  <Wallet className="h-4 w-4" />
                  {account.displayName}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
