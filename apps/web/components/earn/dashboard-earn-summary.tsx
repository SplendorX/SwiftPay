"use client";

import { ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { browserPosition } from "@/lib/earn/browser";
import { useEarnWallet } from "@/lib/earn/use-earn-wallet";
import { formatUsdGrouped } from "@/lib/earn/display";
import {
  EARN_POSITION_EVENT,
  EARN_SELECTION_EVENT,
  readSelectedEarnVault,
} from "@/lib/earn/selected-vault";
import type { EarnPosition } from "@/lib/earn/types";
import { formatUsdcDisplay, tryParseUsdc } from "@/lib/onchain-money";
import { usePlatformWallet } from "@/lib/use-platform-wallet";

type DashboardEarnSummaryProps = {
  /** Spendable USDC balance in base units (wallet). */
  availableUsdc?: bigint;
  /** Mirrors the dashboard privacy toggle. */
  hideBalance?: boolean;
};

function formatMoney(units: bigint | undefined): string {
  if (units === undefined) return "n/a";
  return formatUsdcDisplay(units);
}

/**
 * Unified Available / Earn / Total strip for the main dashboard.
 * Earn values come from App Kit position data for the selected vault.
 */
export function DashboardEarnSummary({
  availableUsdc,
  hideBalance = false,
}: DashboardEarnSummaryProps) {
  const { address, isConnected } = usePlatformWallet();
  const earnWallet = useEarnWallet();
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [position, setPosition] = useState<EarnPosition | null>(null);

  const refreshSelection = useCallback(() => {
    setVaultAddress(readSelectedEarnVault());
  }, []);

  useEffect(() => {
    refreshSelection();
    window.addEventListener(EARN_SELECTION_EVENT, refreshSelection);
    window.addEventListener("storage", refreshSelection);
    return () => {
      window.removeEventListener(EARN_SELECTION_EVENT, refreshSelection);
      window.removeEventListener("storage", refreshSelection);
    };
  }, [refreshSelection]);

  const loadPosition = useCallback(async () => {
    // The position is read through the wallet's own adapter, so it needs a
    // connected external wallet — the same one that would sign a deposit.
    if (!address || !vaultAddress || !earnWallet.resolveProvider) {
      setPosition(null);
      return;
    }
    try {
      const next = await browserPosition({
        currentChainId: earnWallet.currentChainId,
        resolveProvider: earnWallet.resolveProvider,
        vaultAddress,
      });
      setPosition(next);
    } catch {
      setPosition(null);
    }
  }, [address, earnWallet.currentChainId, earnWallet.resolveProvider, vaultAddress]);

  useEffect(() => {
    void loadPosition();
    window.addEventListener(EARN_POSITION_EVENT, loadPosition);
    return () => {
      window.removeEventListener(EARN_POSITION_EVENT, loadPosition);
    };
  }, [loadPosition]);

  const earnUnits =
    position?.currentBalance != null
      ? tryParseUsdc(position.currentBalance)
      : undefined;
  const masked = "••••••";
  const earnLabel = !isConnected
    ? "n/a"
    : hideBalance
      ? masked
      : formatUsdGrouped(position?.currentBalance) ?? "—";
  const yieldLabel =
    hideBalance
      ? null
      : position?.pnl?.status === "available" && position.pnl.totalYieldEarned
        ? `+ ${formatUsdGrouped(position.pnl.totalYieldEarned)} earned`
        : position?.pnl?.status === "pending"
          ? "Reconciling…"
          : null;
  const available = availableUsdc;
  const total =
    available !== undefined || earnUnits !== undefined
      ? (available ?? 0n) + (earnUnits ?? 0n)
      : undefined;

  return (
    <section className="earn-dashboard-summary" aria-label="Available and Invest balances">
      <div className="earn-dashboard-summary-header">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-swift-600" />
          <p className="section-eyebrow" style={{ margin: 0 }}>
            Unified balance
          </p>
        </div>
      </div>

      <dl className="earn-dashboard-stack">
        <div className="earn-dashboard-row">
          <dt>Available to spend</dt>
          <dd>
            {!isConnected ? "n/a" : hideBalance ? masked : `$${formatMoney(available)}`}
          </dd>
        </div>
        <div className="earn-dashboard-row">
          <dt>Invest</dt>
          <dd>
            {earnLabel}
            {yieldLabel ? (
              <span className="earn-dashboard-yield">{yieldLabel}</span>
            ) : null}
          </dd>
        </div>
        <div className="earn-dashboard-row earn-dashboard-row-total">
          <dt>Total</dt>
          <dd>
            {!isConnected ? "n/a" : hideBalance ? masked : `$${formatMoney(total)}`}
          </dd>
        </div>
      </dl>

      <div className="earn-actions earn-dashboard-actions">
        <Link className="earn-btn earn-btn-primary" href="/earn?action=deposit">
          <ArrowDownToLine className="h-4 w-4" />
          Move to Invest
        </Link>
        <Link className="earn-btn earn-btn-secondary" href="/earn?action=withdraw">
          <ArrowUpFromLine className="h-4 w-4" />
          Move to Balance
        </Link>
      </div>

      <p className="earn-footnote">
        Spendable wallet USDC stays in your wallet. Invest is a separate vault
        position and is not moved automatically to fund payments.
      </p>
    </section>
  );
}
