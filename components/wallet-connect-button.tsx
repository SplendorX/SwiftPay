"use client";

import { useAppKit } from "@reown/appkit/react";
import { AlertCircle, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useAccount } from "wagmi";

import { arcTestnet } from "@/lib/wagmi";

type WalletConnectButtonProps = {
  onConnectIntent?: () => void;
};

function formatAddress(value?: string) {
  if (!value || !isAddress(value)) {
    return "Wallet";
  }

  const address = getAddress(value);

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectButton({
  onConnectIntent,
}: WalletConnectButtonProps) {
  const { open } = useAppKit();
  const { address, chainId, isConnected, status } = useAccount();
  const [mounted, setMounted] = useState(false);
  const isConnecting = status === "connecting" || status === "reconnecting";
  const isWrongNetwork = Boolean(
    isConnected && chainId && chainId !== arcTestnet.id,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  async function openConnectModal() {
    onConnectIntent?.();
    await open({ view: "Connect" });
  }

  async function openAccountModal() {
    await open({ view: "Account" });
  }

  async function openNetworkModal() {
    await open({ view: "Networks" });
  }

  return (
    <div
      aria-hidden={!mounted}
      className={!mounted ? "pointer-events-none opacity-0" : ""}
    >
      {!isConnected ? (
        <button
          className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(66,17,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(66,17,143,0.34)] active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2"
          onClick={() => void openConnectModal()}
          type="button"
        >
          {isConnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          Connect wallet
        </button>
      ) : isWrongNetwork ? (
        <button
          className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(225,29,72,0.2)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-2"
          onClick={() => void openNetworkModal()}
          type="button"
        >
          <AlertCircle className="h-4 w-4" />
          Switch network
        </button>
      ) : (
        <button
          className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-bold text-white shadow-[0_14px_32px_rgba(66,17,143,0.24)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
          onClick={() => void openAccountModal()}
          type="button"
        >
          <CheckCircle2 className="h-4 w-4" />
          {formatAddress(address)}
        </button>
      )}
    </div>
  );
}
