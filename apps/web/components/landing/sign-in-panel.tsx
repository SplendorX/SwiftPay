"use client";

import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { CircleGoogleLogin } from "@/components/circle-google-login";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { writeActivatedExternalProfile } from "@/lib/platform-access";
import { ensureProfile } from "@/lib/profile";

export function SignInPanel() {
  const { address, isConnected } = useAccount();
  const [externalConnectStarted, setExternalConnectStarted] = useState(false);

  useEffect(() => {
    if (externalConnectStarted && isConnected && address) {
      writeActivatedExternalProfile(address);
      void ensureProfile({
        authProvider: "external",
        walletAddress: address,
      }).catch(() => undefined);
      setExternalConnectStarted(false);
    }
  }, [address, externalConnectStarted, isConnected]);

  return (
    <div className="sign-in-panel" id="sign-in">
      <div className="sign-in-panel-header">
        <p className="section-eyebrow">Get started</p>
        <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight">
          Choose how to sign in
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          Connect an external wallet or continue with Google for a Circle wallet.
        </p>
      </div>

      <div className="sign-in-option">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">External wallet</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          MetaMask, WalletConnect, and other Arc-compatible wallets.
        </p>
        <div className="mt-3">
          <WalletConnectButton
            className="w-full"
            fullWidth
            onConnectIntent={() => setExternalConnectStarted(true)}
            variant="outline"
          />
        </div>
        {isConnected && address ? (
          <Button asChild className="mt-2 w-full" size="lg">
            <Link href="/dashboard">
              Continue to dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="sign-in-divider">
        <Separator className="flex-1" />
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          or
        </span>
        <Separator className="flex-1" />
      </div>

      <CircleGoogleLogin embedded />
    </div>
  );
}