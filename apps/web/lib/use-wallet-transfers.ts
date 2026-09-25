"use client";

import { useEffect, useState } from "react";

import {
  getArcScanHistoryUrls,
  normalizeArcScanTokenTransfers,
  type ArcScanTokenTransferResponse,
  type WalletTransfer,
} from "@/lib/arcscan-history";

/**
 * A wallet's on-chain transfer history: ArcScan directly, falling back to the
 * app's own /api/arcscan/history proxy. Change `refreshKey` to refetch (e.g.
 * when a payment settles).
 */
export function useWalletTransfers(address?: string | null, refreshKey = "") {
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

    async function loadDirectArcScanHistory() {
      const responses = await Promise.all(
        getArcScanHistoryUrls(connectedAddress).map((url) =>
          fetch(url, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ),
      );

      if (responses.some((response) => !response.ok)) {
        throw new Error("ArcScan history is unavailable.");
      }

      const payload = (await Promise.all(
        responses.map((response) => response.json()),
      )) as ArcScanTokenTransferResponse[];

      return normalizeArcScanTokenTransfers(connectedAddress, payload);
    }

    async function loadLocalArcScanHistory() {
      const response = await fetch(
        `/api/arcscan/history?address=${connectedAddress}`,
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
        try {
          setWalletTransfers(await loadDirectArcScanHistory());
        } catch (directError) {
          if (controller.signal.aborted) {
            return;
          }

          try {
            setWalletTransfers(await loadLocalArcScanHistory());
          } catch {
            throw directError;
          }
        }
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
  }, [address, refreshKey]);

  return {
    error: transfersError,
    isLoading: isTransfersLoading,
    transfers: walletTransfers,
  };
}
