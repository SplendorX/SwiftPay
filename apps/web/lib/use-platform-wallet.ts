"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { useAccount } from "wagmi";

import { useOptionalWorkspace } from "@/components/business/workspace-provider";
import { activeCircleWallet } from "@/lib/business/provision-wallet";
import {
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
  type CircleWallet,
} from "@/lib/circle-session";
import {
  readPreferredWalletMode,
  walletModeEventName,
  type WalletMode,
} from "@/lib/wallet-mode";
import { ensureProfile } from "@/lib/profile";

export function usePlatformWallet() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const workspaceContext = useOptionalWorkspace();
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(
    null,
  );
  const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
  const [preferredMode, setPreferredMode] = useState<WalletMode | null>(null);

  const refreshCircleState = useCallback(() => {
    setCircleLogin(readCircleLogin());
    setCircleWallets(readCircleWallets());
    setPreferredMode(readPreferredWalletMode());
  }, []);

  useEffect(() => {
    refreshCircleState();
    window.addEventListener(circleSessionEventName, refreshCircleState);
    window.addEventListener(walletModeEventName, refreshCircleState);
    return () => {
      window.removeEventListener(circleSessionEventName, refreshCircleState);
      window.removeEventListener(walletModeEventName, refreshCircleState);
    };
  }, [refreshCircleState]);

  const isBusinessWorkspace = workspaceContext?.workspace?.kind === "business";
  const circleWallet = useMemo(
    () =>
      activeCircleWallet(
        workspaceContext?.workspace ?? null,
        circleWallets,
        workspaceContext?.ownerWallet,
      ),
    [
      circleWallets,
      workspaceContext?.ownerWallet,
      workspaceContext?.workspace,
    ],
  );
  const circleWalletAddress = circleWallet?.address ?? "";

  useEffect(() => {
    if (!circleLogin || !circleWalletAddress) return;
    const identity = getCircleLoginIdentity(circleLogin);
    void ensureProfile({
      authProvider: "google",
      circleSocialUuid: identity.socialUserUUID,
      displayName: identity.name,
      walletAddress: circleWalletAddress,
    }).catch(() => undefined);
  }, [circleLogin, circleWalletAddress]);

  const circleReady = Boolean(
    circleLogin && circleWalletAddress && isAddress(circleWalletAddress),
  );
  const externalReady = Boolean(
    isConnected && wagmiAddress && isAddress(wagmiAddress),
  );

  const address = useMemo((): Address | undefined => {
    const circleAddress =
      circleReady && circleWalletAddress
        ? (getAddress(circleWalletAddress).toLowerCase() as Address)
        : undefined;
    const externalAddress =
      externalReady && wagmiAddress
        ? (getAddress(wagmiAddress).toLowerCase() as Address)
        : undefined;

    if (isBusinessWorkspace) {
      return circleAddress;
    }

    if (preferredMode === "external" && externalAddress) {
      return externalAddress;
    }

    if (preferredMode === "circle" && circleAddress) {
      return circleAddress;
    }

    return circleAddress ?? externalAddress;
  }, [
    circleReady,
    circleWalletAddress,
    externalReady,
    isBusinessWorkspace,
    preferredMode,
    wagmiAddress,
  ]);

  const source = useMemo(() => {
    if (isBusinessWorkspace) {
      return circleReady ? ("embedded" as const) : null;
    }

    if (preferredMode === "external" && externalReady) {
      return "external" as const;
    }

    if (preferredMode === "circle" && circleReady) {
      return "embedded" as const;
    }

    if (circleReady) {
      return "embedded" as const;
    }

    if (externalReady) {
      return "external" as const;
    }

    return null;
  }, [circleReady, externalReady, isBusinessWorkspace, preferredMode]);

  const circleSocialUuid = useMemo(
    () => getCircleLoginIdentity(circleLogin)?.socialUserUUID ?? undefined,
    [circleLogin],
  );

  return {
    address,
    circleSocialUuid,
    circleWallet,
    isBusinessWorkspace,
    isConnected: Boolean(address),
    needsBusinessWallet: isBusinessWorkspace && !circleWallet,
    source,
  };
}
