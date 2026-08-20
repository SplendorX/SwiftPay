"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { useAccount } from "wagmi";

import {
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
} from "@/lib/circle-session";
import {
  readPreferredWalletMode,
  walletModeEventName,
  type WalletMode,
} from "@/lib/wallet-mode";

export function usePlatformWallet() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(
    null,
  );
  const [circleWalletAddress, setCircleWalletAddress] = useState("");
  const [preferredMode, setPreferredMode] = useState<WalletMode | null>(null);

  const refreshCircleState = useCallback(() => {
    const login = readCircleLogin();
    setCircleLogin(login);
    const wallets = readCircleWallets();
    setCircleWalletAddress(wallets[0]?.address ?? "");
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
    preferredMode,
    wagmiAddress,
  ]);

  const source = useMemo(() => {
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
  }, [circleReady, externalReady, preferredMode]);

  const circleSocialUuid = useMemo(
    () => getCircleLoginIdentity(circleLogin)?.socialUserUUID ?? undefined,
    [circleLogin],
  );

  return {
    address,
    circleSocialUuid,
    isConnected: Boolean(address),
    source,
  };
}
