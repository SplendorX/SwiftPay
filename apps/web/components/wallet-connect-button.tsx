"use client";

import { useAppKit } from "@reown/appkit/react";
import { AlertCircle, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { arcTestnet } from "@/lib/wagmi";

type WalletConnectButtonProps = {
  className?: string;
  fullWidth?: boolean;
  onConnectIntent?: () => void;
  variant?: "default" | "outline";
};

function formatAddress(value?: string) {
  if (!value || !isAddress(value)) {
    return "Wallet";
  }

  const address = getAddress(value);

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectButton({
  className,
  fullWidth = false,
  onConnectIntent,
  variant = "default",
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

  const widthClass = fullWidth ? "w-full" : "";

  return (
    <div
      aria-hidden={!mounted}
      className={cn(!mounted && "pointer-events-none opacity-0", className)}
    >
      {!isConnected ? (
        <Button
          className={cn("h-11", widthClass)}
          onClick={() => void openConnectModal()}
          type="button"
          variant={variant}
        >
          {isConnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          Connect wallet
        </Button>
      ) : isWrongNetwork ? (
        <Button
          className={cn("h-11", widthClass)}
          onClick={() => void openNetworkModal()}
          type="button"
          variant="destructive"
        >
          <AlertCircle className="h-4 w-4" />
          Switch network
        </Button>
      ) : (
        <Button
          className={cn("h-11", widthClass)}
          onClick={() => void openAccountModal()}
          type="button"
          variant={variant === "outline" ? "secondary" : "default"}
        >
          <CheckCircle2 className="h-4 w-4" />
          {formatAddress(address)}
        </Button>
      )}
    </div>
  );
}