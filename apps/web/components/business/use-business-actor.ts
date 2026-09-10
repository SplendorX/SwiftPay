"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";

import {
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
  type CircleWallet,
} from "@/lib/circle-session";

export function useBusinessActor() {
  const { address } = useAccount();
  const [login, setLogin] = useState<CircleLoginResult | null>(null);
  const [wallets, setWallets] = useState<CircleWallet[]>([]);

  useEffect(() => {
    function refresh() {
      setLogin(readCircleLogin());
      setWallets(readCircleWallets());
    }
    refresh();
    window.addEventListener(circleSessionEventName, refresh);
    return () => window.removeEventListener(circleSessionEventName, refresh);
  }, []);

  const circleAddress = wallets.find(
    (wallet) => wallet.address && isAddress(wallet.address),
  )?.address;
  const ownerWallet = (circleAddress || address)?.toLowerCase() ?? null;
  const circleSocialUuid = getCircleLoginIdentity(login)?.socialUserUUID;

  return { circleLogin: login, circleSocialUuid, ownerWallet };
}
