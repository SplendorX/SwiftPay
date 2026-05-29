"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertCircle, ChevronDown, Wallet } from "lucide-react";

type WalletConnectButtonProps = {
  onConnectIntent?: () => void;
};

export function WalletConnectButton({
  onConnectIntent,
}: WalletConnectButtonProps) {
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
                className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(66,17,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(66,17,143,0.34)] active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2"
                onClick={() => {
                  onConnectIntent?.();
                  openConnectModal();
                }}
                type="button"
              >
                <Wallet className="h-4 w-4" />
                Connect wallet
              </button>
            ) : chain.unsupported ? (
              <button
                className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(225,29,72,0.2)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-2"
                onClick={openChainModal}
                type="button"
              >
                <AlertCircle className="h-4 w-4" />
                Wrong network
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  className="font-ui hidden h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/85 px-3 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0 sm:inline-flex"
                  onClick={openChainModal}
                  type="button"
                >
                  {chain.hasIcon && chain.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={chain.name ?? "Network"}
                      className="h-4 w-4 rounded-full bg-swift-700 p-0.5"
                      src={chain.iconUrl}
                    />
                  ) : null}
                  {chain.name}
                  <ChevronDown className="h-3.5 w-3.5 text-muted" />
                </button>
                <button
                  className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-bold text-white shadow-[0_14px_32px_rgba(66,17,143,0.24)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                  onClick={openAccountModal}
                  type="button"
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
