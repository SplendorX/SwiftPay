"use client";

import { useCallback, useEffect, useState } from "react";

import { browserPosition } from "@/lib/earn/browser";
import { EARN_POSITION_EVENT } from "@/lib/earn/selected-vault";
import type { EarnPosition } from "@/lib/earn/types";

/**
 * The signed-in wallet's position in a vault, kept fresh: every 30 seconds,
 * and right after a deposit or withdrawal announces itself.
 */
export function useEarnPosition(input: {
  connectedAddress?: string | null;
  currentChainId?: number;
  resolveProvider?: (() => Promise<unknown>) | null;
  vaultAddress?: string | null;
}) {
  const { connectedAddress, currentChainId, resolveProvider, vaultAddress } = input;
  const [position, setPosition] = useState<EarnPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vaultAddress || !connectedAddress || !resolveProvider) {
      setPosition(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPosition(await browserPosition({ currentChainId, resolveProvider, vaultAddress }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Position could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [connectedAddress, currentChainId, resolveProvider, vaultAddress]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    window.addEventListener(EARN_POSITION_EVENT, load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(EARN_POSITION_EVENT, load);
    };
  }, [load]);

  return { error, loading, position, refresh: load };
}
