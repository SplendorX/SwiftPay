"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { browserPosition } from "@/lib/earn/browser";
import { formatApy, formatUsdGrouped, vaultName } from "@/lib/earn/display";
import { EARN_POSITION_EVENT } from "@/lib/earn/selected-vault";
import type { EarnPosition as EarnPositionData, EarnVault } from "@/lib/earn/types";

type EarnPositionProps = {
  connectedAddress?: string | null;
  currentChainId?: number;
  resolveProvider?: (() => Promise<unknown>) | null;
  selectedVault?: EarnVault | null;
  vaultAddress?: string | null;
};

function yieldDisplay(position: EarnPositionData | null) {
  const pnl = position?.pnl;
  if (!pnl) return "—";
  if (pnl.status === "pending") return "Reconciling…";
  if (pnl.status === "unavailable") return pnl.reason || "Unavailable";
  if (pnl.status === "available") {
    const earned = formatUsdGrouped(pnl.totalYieldEarned);
    return earned ? `+${earned}` : "—";
  }
  return "—";
}

export function EarnPosition({
  connectedAddress,
  currentChainId,
  resolveProvider,
  selectedVault,
  vaultAddress,
}: EarnPositionProps) {
  const [position, setPosition] = useState<EarnPositionData | null>(null);
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
      const next = await browserPosition({
        currentChainId,
        resolveProvider,
        vaultAddress,
      });
      setPosition(next);
    } catch (cause) {
      setPosition(null);
      setError(
        cause instanceof Error ? cause.message : "Position could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [connectedAddress, currentChainId, resolveProvider, vaultAddress]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);
    window.addEventListener(EARN_POSITION_EVENT, load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(EARN_POSITION_EVENT, load);
    };
  }, [load]);

  if (!vaultAddress) {
    return (
      <p className="earn-footnote">
        Select a vault to see your Earn position.
      </p>
    );
  }

  if (!connectedAddress) {
    return (
      <p className="earn-footnote">Connect a wallet to load your position.</p>
    );
  }

  if (loading && !position) {
    return (
      <div className="earn-connect-hint">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your Earn position…
      </div>
    );
  }

  if (error && !position) {
    return <p className="earn-error">{error}</p>;
  }

  const pnl = position?.pnl;
  const principal =
    pnl && pnl.status === "available"
      ? formatUsdGrouped(pnl.principalDeposited)
      : pnl?.status === "pending"
        ? "Reconciling…"
        : pnl?.status === "unavailable"
          ? pnl.reason || "Unavailable"
          : "—";
  const apy = formatApy(position?.currentApy);

  return (
    <article className="earn-balance-card">
      <div className="earn-balance-header">
        <span>Your Earn Position</span>
      </div>
      <p className="earn-balance-value">
        {formatUsdGrouped(position?.currentBalance) ?? "—"}
      </p>
      <p className="earn-balance-sub">Current balance</p>
      <p className="earn-balance-earned">{yieldDisplay(position)}</p>
      <p className="earn-footnote">
        Your balance represents the value of your USDC position in the selected
        vault.
      </p>
      <div className="earn-stat-row">
        <div>
          <p className="earn-stat-label">Principal deposited</p>
          <p className="earn-stat-value">{principal}</p>
        </div>
        <div>
          <p className="earn-stat-label">Current APY</p>
          <p className="earn-stat-value">{apy ?? "—"}</p>
        </div>
        <div>
          <p className="earn-stat-label">Shares</p>
          <p className="earn-stat-value">{position?.shares ?? "—"}</p>
        </div>
      </div>
      <p className="earn-powered">
        {position?.vaultName ||
          (selectedVault ? vaultName(selectedVault) : "Selected vault")}
      </p>
      {error ? <p className="earn-error">{error}</p> : null}
    </article>
  );
}
