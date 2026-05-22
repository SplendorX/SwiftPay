"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { CircleFaucetLink } from "@/components/circle-faucet-link";
import { PlatformNavDrawer } from "@/components/platform-nav-drawer";
import { ProfileMenu } from "@/components/profile-menu";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import {
  readActivatedExternalProfile,
  writeActivatedExternalProfile,
} from "@/lib/platform-access";

export function PlatformProfileControls({
  showDashboardLink = false,
}: {
  showDashboardLink?: boolean;
}) {
  const { address, isConnected } = useAccount();
  const [externalConnectStarted, setExternalConnectStarted] = useState(false);

  useEffect(() => {
    if (externalConnectStarted && isConnected && address) {
      writeActivatedExternalProfile(address);
      setExternalConnectStarted(false);
    }
  }, [address, externalConnectStarted, isConnected]);

  useEffect(() => {
    if (
      isConnected &&
      address &&
      readActivatedExternalProfile() === address.toLowerCase()
    ) {
      writeActivatedExternalProfile(address);
    }
  }, [address, isConnected]);

  return (
    <div className="flex items-center gap-2 justify-self-start lg:justify-self-end">
      {showDashboardLink ? (
        <Link
          className="font-ui hidden h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(66,17,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(66,17,143,0.34)] active:translate-y-0 sm:inline-flex"
          href="/dashboard"
        >
          Dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
      <CircleFaucetLink />
      <ProfileMenu
        externalAddress={isConnected ? address : undefined}
        externalWalletAction={
          <WalletConnectButton
            onConnectIntent={() => setExternalConnectStarted(true)}
          />
        }
        onWalletModeChange={() => undefined}
      />
      <PlatformNavDrawer />
    </div>
  );
}
