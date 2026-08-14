"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useAccount } from "wagmi";

import {
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
} from "@/lib/circle-session";

export function usePlatformWallet() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(
    null,
  );
  const [circleWalletAddress, setCircleWalletAddress] = useState("");

  const refreshCircleState = useCallback(() => {
    const login = readCircleLogin();
    setCircleLogin(login);
    const wallets = readCircleWallets();
    setCircleWalletAddress(wallets[0]?.address ?? "");
  }, []);

  useEffect(() => {
    refreshCircleState();
    window.addEventListener(circleSessionEventName, refreshCircleState);
    return () => {
      window.removeEventListener(circleSessionEventName, refreshCircleState);
    };
  }, [refreshCircleState]);

  const address = useMemo(() => {
    if (circleLogin && circleWalletAddress && isAddress(circleWalletAddress)) {
      return getAddress(circleWalletAddress).toLowerCase();
    }

    if (isConnected && wagmiAddress && isAddress(wagmiAddress)) {
      return getAddress(wagmiAddress).toLowerCase();
    }

    return undefined;
  }, [circleLogin, circleWalletAddress, isConnected, wagmiAddress]);

  const source = useMemo(() => {
    if (circleLogin && circleWalletAddress && isAddress(circleWalletAddress)) {
      return "embedded" as const;
    }

    if (isConnected && wagmiAddress) {
      return "external" as const;
    }

    return null;
  }, [circleLogin, circleWalletAddress, isConnected, wagmiAddress]);

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
