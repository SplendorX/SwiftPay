"use client";

import { useEffect, useState } from "react";

import type { WalletTransfer } from "@/lib/arcscan-history";

/**
 * A wallet's on-chain transfer history, with its ALLIE Agent Wallet's merged
 * in, from the app's /api/arcscan/history (the explorer on testnet, the Arc
 * RPC on mainnet, where the explorer blocks servers and browsers alike).
 * Change `refreshKey` to refetch (e.g. when a payment settles).
 */
export function useWalletTransfers(address?: string | null, refreshKey = "", days?: number) {
  const [walletTransfers, setWalletTransfers] = useState<WalletTransfer[]>([]);
  const [isTransfersLoading, setIsTransfersLoading] = useState(false);
  const [transfersError, setTransfersError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setWalletTransfers([]);
      return;
    }

    const controller = new AbortController();
    const connectedAddress = address;

    async function loadLocalArcScanHistory() {
      const response = await fetch(
        `/api/arcscan/history?address=${connectedAddress}${days ? `&days=${days}` : ""}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      const payload = (await response.json()) as {
        items?: WalletTransfer[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to load wallet history.");
      }

      return payload.items ?? [];
    }

    async function loadTransfers() {
      setIsTransfersLoading(true);
      setTransfersError(null);

      try {
        setWalletTransfers(await loadLocalArcScanHistory());
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setTransfersError(error instanceof Error ? error.message : "Unable to load wallet history.");
      } finally {
        if (!controller.signal.aborted) {
          setIsTransfersLoading(false);
        }
      }
    }

    void loadTransfers();

    return () => {
      controller.abort();
    };
  }, [address, days, refreshKey]);

  return {
    error: transfersError,
    isLoading: isTransfersLoading,
    transfers: walletTransfers,
  };
}
