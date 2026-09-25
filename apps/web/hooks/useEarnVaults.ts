"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchEarnVaults } from "@/lib/earn/client";
import {
  clearSelectedEarnVault,
  EARN_SELECTION_EVENT,
  readSelectedEarnVault,
  writeSelectedEarnVault,
} from "@/lib/earn/selected-vault";
import type { EarnVault } from "@/lib/earn/types";

export function useEarnVaults() {
  const [vaults, setVaults] = useState<EarnVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEarnVaults();
      const next = Array.isArray(result.vaults) ? result.vaults : [];
      setVaults(next);

      // A vault can leave the list (the router cannot price non-18-decimal
      // shares), so drop a stored selection that is no longer on offer —
      // otherwise Earn keeps showing a vault nobody can deposit into.
      const stored = readSelectedEarnVault();
      if (
        stored &&
        !next.some(
          (vault) =>
            vault.vaultAddress?.toLowerCase() === stored.toLowerCase(),
        )
      ) {
        clearSelectedEarnVault();
      }
    } catch (cause) {
      setVaults([]);
      setError(
        cause instanceof Error ? cause.message : "Vaults could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { error, loading, refresh, vaults };
}

export function useSelectedEarnVault() {
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);

  useEffect(() => {
    setVaultAddress(readSelectedEarnVault());
    function onChange(event: Event) {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        setVaultAddress(event.detail);
        return;
      }
      setVaultAddress(readSelectedEarnVault());
    }
    window.addEventListener(EARN_SELECTION_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EARN_SELECTION_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const selectVault = useCallback((address: string) => {
    writeSelectedEarnVault(address);
    setVaultAddress(address);
  }, []);

  return { selectVault, vaultAddress };
}
