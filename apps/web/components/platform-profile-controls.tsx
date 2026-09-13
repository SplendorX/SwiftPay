"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { ProfileMenu } from "@/components/profile-menu";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import {
  readActivatedExternalProfile,
  writeActivatedExternalProfile,
} from "@/lib/platform-access";
import { ensureProfile } from "@/lib/profile";
import { usePreferredWalletMode } from "@/lib/use-preferred-wallet-mode";
import { writePreferredWalletMode } from "@/lib/wallet-mode";

export function PlatformProfileControls() {
  const { address, isConnected } = useAccount();
  const [walletMode, setWalletMode] = usePreferredWalletMode("external");
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

  // When the connected external wallet changes, point platform access at it.
  useEffect(() => {
    if (!isConnected || !address) {
      return;
    }

    const activated = readActivatedExternalProfile();
    const next = address.toLowerCase();

    // Only write when the activated profile is missing or different.
    if (activated === next) {
      return;
    }

    if (!activated || activated !== next) {
      writeActivatedExternalProfile(address);
      void ensureProfile({
        authProvider: "external",
        walletAddress: address,
      }).catch(() => undefined);
    }
  }, [address, isConnected]);

  return (
    <ProfileMenu
      externalAddress={isConnected ? address : undefined}
      externalWalletAction={
        <WalletConnectButton
          onConnectIntent={() => setExternalConnectStarted(true)}
        />
      }
      onWalletModeChange={(mode) => {
        writePreferredWalletMode(mode);
        setWalletMode(mode);
      }}
      walletMode={walletMode}
    />
  );
}
