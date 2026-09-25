"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { readActivatedExternalProfile, platformAccessEventName } from "@/lib/platform-access";
import { circleSessionEventName } from "@/lib/circle-session";
import { walletModeEventName } from "@/lib/wallet-mode";
import type { ReferralDashboardData, ReferralTier } from "@/lib/referral/types";

export const SWIFTPOINTS_UPDATED_EVENT = "swiftpay:swiftpoints-updated";

/**
 * Dispatches a global event notifying all SwiftPoints listeners to refresh balances.
 */
export function emitSwiftPointsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SWIFTPOINTS_UPDATED_EVENT));
  }
}

export type SwiftPointsState = {
  points: number;
  usdcValue: number;
  tier: ReferralTier;
  pendingPoints: number;
  lifetimeEarned: number;
  redeemed: number;
  referralLink: string;
  referralToken: string;
  activeWallet: string | undefined;
  isConnected: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export function useSwiftPoints(): SwiftPointsState {
  const {
    address: platformAddress,
    circleSocialUuid,
    isConnected: isPlatformConnected,
  } = usePlatformWallet();
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const [activatedExternalAddress, setActivatedExternalAddress] = useState("");

  const refreshExternal = useCallback(() => {
    setActivatedExternalAddress(readActivatedExternalProfile());
  }, []);

  useEffect(() => {
    refreshExternal();
    window.addEventListener(platformAccessEventName, refreshExternal);
    window.addEventListener(circleSessionEventName, refreshExternal);
    window.addEventListener(walletModeEventName, refreshExternal);
    return () => {
      window.removeEventListener(platformAccessEventName, refreshExternal);
      window.removeEventListener(circleSessionEventName, refreshExternal);
      window.removeEventListener(walletModeEventName, refreshExternal);
    };
  }, [refreshExternal]);

  const activeWallet = useMemo(() => {
    if (platformAddress && isAddress(platformAddress)) return platformAddress;
    if (wagmiAddress && isAddress(wagmiAddress)) return wagmiAddress;
    if (activatedExternalAddress && isAddress(activatedExternalAddress)) return activatedExternalAddress;
    return undefined;
  }, [platformAddress, wagmiAddress, activatedExternalAddress]);

  const isConnected = Boolean(activeWallet);

  const [points, setPoints] = useState(0);
  const [usdcValue, setUsdcValue] = useState(0);
  const [tier, setTier] = useState<ReferralTier>("STARTER");
  const [pendingPoints, setPendingPoints] = useState(0);
  const [lifetimeEarned, setLifetimeEarned] = useState(0);
  const [redeemed, setRedeemed] = useState(0);
  const [referralLink, setReferralLink] = useState("");
  const [referralToken, setReferralToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchPoints = useCallback(async () => {
    if (!activeWallet) {
      setPoints(0);
      setUsdcValue(0);
      setPendingPoints(0);
      setLifetimeEarned(0);
      setRedeemed(0);
      setReferralLink("");
      setReferralToken("");
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({ ownerWallet: activeWallet });
      if (circleSocialUuid) params.set("circleSocialUuid", circleSocialUuid);

      // Fetch referral dashboard data for complete points, tier, and referral link
      const res = await fetch(`/api/referrals/dashboard?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const data = (json.data ?? json) as ReferralDashboardData;
        if (data?.swiftPoints) {
          setPoints(data.swiftPoints.available ?? 0);
          setUsdcValue(data.swiftPoints.usdcEquivalent ?? Number(((data.swiftPoints.available ?? 0) * 0.01).toFixed(2)));
          setPendingPoints(data.swiftPoints.pending ?? 0);
          setLifetimeEarned(data.swiftPoints.lifetimeEarned ?? 0);
          setRedeemed(data.swiftPoints.redeemed ?? 0);
        }
        if (data?.currentTier) {
          setTier(data.currentTier);
        }
        if (data?.referralLink) {
          setReferralLink(data.referralLink);
        }
        if (data?.referralToken) {
          setReferralToken(data.referralToken);
        }
        return;
      }

      // Fallback to balance endpoint if dashboard route fails
      const balRes = await fetch(`/api/swiftpoints/balance?${params.toString()}`);
      if (balRes.ok) {
        const balJson = await balRes.json();
        const balData = balJson.data ?? balJson;
        setPoints(balData.available ?? 0);
        setUsdcValue(balData.usdcEquivalent ?? Number(((balData.available ?? 0) * 0.01).toFixed(2)));
        setPendingPoints(balData.pending ?? 0);
        setLifetimeEarned(balData.lifetimeEarned ?? 0);
        setRedeemed(balData.redeemed ?? 0);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setIsLoading(false);
    }
  }, [activeWallet, circleSocialUuid]);

  useEffect(() => {
    setIsLoading(true);
    void fetchPoints();
  }, [fetchPoints]);

  useEffect(() => {
    const handleUpdated = () => {
      void fetchPoints();
    };

    window.addEventListener(SWIFTPOINTS_UPDATED_EVENT, handleUpdated);
    window.addEventListener("focus", handleUpdated);
    return () => {
      window.removeEventListener(SWIFTPOINTS_UPDATED_EVENT, handleUpdated);
      window.removeEventListener("focus", handleUpdated);
    };
  }, [fetchPoints]);

  return {
    points,
    usdcValue,
    tier,
    pendingPoints,
    lifetimeEarned,
    redeemed,
    referralLink,
    referralToken,
    activeWallet,
    isConnected,
    isLoading,
    refresh: fetchPoints,
  };
}
