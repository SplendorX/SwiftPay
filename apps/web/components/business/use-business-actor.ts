"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";

import {
  callCircleWalletApi,
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  writeCircleWallets,
  type CircleLoginResult,
  type CircleWallet,
} from "@/lib/circle-session";
import {
  resolvePlatformWalletMode,
  walletModeEventName,
  type WalletMode,
} from "@/lib/wallet-mode";

export function useBusinessActor() {
  const { address } = useAccount();
  const [login, setLogin] = useState<CircleLoginResult | null>(() =>
    typeof window === "undefined" ? null : readCircleLogin(),
  );
  const [wallets, setWallets] = useState<CircleWallet[]>(() =>
    typeof window === "undefined" ? [] : readCircleWallets(),
  );
  const [walletMode, setWalletMode] = useState<WalletMode>(() =>
    typeof window === "undefined" ? "external" : resolvePlatformWalletMode(),
  );

  useEffect(() => {
    function refresh() {
      setLogin(readCircleLogin());
      setWallets(readCircleWallets());
      setWalletMode(resolvePlatformWalletMode());
    }
    refresh();
    window.addEventListener(circleSessionEventName, refresh);
    window.addEventListener(walletModeEventName, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(circleSessionEventName, refresh);
      window.removeEventListener(walletModeEventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!login?.userToken || wallets.length > 0) return;
    let isMounted = true;
    callCircleWalletApi<{ wallets?: CircleWallet[] }>("listWallets", {
      userToken: login.userToken,
    })
      .then((payload) => {
        if (!isMounted) return;
        const nextWallets = payload?.wallets ?? [];
        if (nextWallets.length > 0) {
          writeCircleWallets(nextWallets);
          setWallets(nextWallets);
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [login?.userToken, wallets.length]);

  const circleAddress = wallets.find(
    (wallet) => wallet.address && isAddress(wallet.address),
  )?.address;

  // Respect active wallet mode:
  // If mode is external and wagmi address is connected, use external address.
  // If mode is circle and circle address exists, use circle address.
  // Otherwise, fall back to whichever address is available.
  const ownerWallet =
    walletMode === "external"
      ? (address || circleAddress)?.toLowerCase() ?? null
      : (circleAddress || address)?.toLowerCase() ?? null;

  const circleSocialUuid =
    walletMode === "circle" || !address
      ? getCircleLoginIdentity(login)?.socialUserUUID
      : undefined;

  return { circleLogin: login, circleSocialUuid, ownerWallet };
}
