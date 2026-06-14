"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { CircleFaucetLink } from "@/components/circle-faucet-link";
import { ProfileMenu } from "@/components/profile-menu";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import {
  readActivatedExternalProfile,
  writeActivatedExternalProfile,
} from "@/lib/platform-access";

export function PlatformProfileControls() {
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
    <div className="flex min-w-0 items-center gap-2 justify-self-start lg:justify-self-end">
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
    </div>
  );
}
