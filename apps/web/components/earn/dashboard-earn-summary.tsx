"use client";

import { ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { usePlatformWallet } from "@/lib/use-platform-wallet";

import { earnConfig, isEarnDepositEnabled } from "@/lib/earn/config";
import { swiftPayVaultAbi } from "@/lib/earn/abis";
import { formatUsdDisplay } from "@/lib/earn/performance";
import { formatUnitsToDecimal } from "@/lib/earn/decimal";
import { arcTestnetTokens } from "@/lib/tokens";

type DashboardEarnSummaryProps = {
  /** Spendable USDC balance in base units (wallet). */
  availableUsdc?: bigint;
};

function formatMoney(units: bigint | undefined, decimals = 6): string {
  if (units === undefined) return "—";
  return formatUsdDisplay(formatUnitsToDecimal(units, decimals));
}

/**
 * Unified Available / Earn / Total strip for the main dashboard (#29).
 */
export function DashboardEarnSummary({
  availableUsdc,
}: DashboardEarnSummaryProps) {
  const { address: wagmiAddress } = useAccount();
  const { address: platformAddress, isConnected } = usePlatformWallet();
  const address = platformAddress ?? wagmiAddress;
  const vault = earnConfig.vaultAddress;
  const mode = earnConfig.mode;
  const depositsEnabled = isEarnDepositEnabled(mode) && Boolean(vault);
  const usdc = arcTestnetTokens.USDC;

  const { data: shareBalance } = useReadContract({
    address: vault ?? undefined,
    abi: swiftPayVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && vault) },
  });

  const { data: earnAssets } = useReadContract({
    address: vault ?? undefined,
    abi: swiftPayVaultAbi,
    functionName: "convertToAssets",
    args: shareBalance !== undefined ? [shareBalance as bigint] : undefined,
    query: { enabled: Boolean(vault && shareBalance !== undefined) },
  });

  const available = availableUsdc;
  const earn = typeof earnAssets === "bigint" ? earnAssets : undefined;
  const total =
    available !== undefined || earn !== undefined
      ? (available ?? 0n) + (earn ?? 0n)
      : undefined;

  return (
    <section className="earn-dashboard-summary" aria-label="Available and Earn balances">
      <div className="earn-dashboard-summary-header">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-swift-600" />
          <p className="section-eyebrow" style={{ margin: 0 }}>
            Unified balance
          </p>
        </div>
        {mode === "simulation" && (
          <span className="earn-pill earn-pill-warn">Simulation · not real yield</span>
        )}
        {mode === "unavailable" && (
          <span className="earn-pill">Earn unavailable</span>
        )}
      </div>

      <div className="earn-dashboard-grid">
        <div className="earn-dashboard-stat">
          <p className="earn-stat-label">Available to spend</p>
          <p className="earn-dashboard-value">
            ${isConnected ? formatMoney(available, usdc.decimals) : "—"}
          </p>
        </div>
        <div className="earn-dashboard-stat">
          <p className="earn-stat-label">Earn</p>
          <p className="earn-dashboard-value">
            ${isConnected ? formatMoney(earn, usdc.decimals) : "—"}
          </p>
        </div>
        <div className="earn-dashboard-stat earn-dashboard-stat-total">
          <p className="earn-stat-label">Total</p>
          <p className="earn-dashboard-value">
            ${isConnected ? formatMoney(total, usdc.decimals) : "—"}
          </p>
        </div>
      </div>

      <div className="earn-actions earn-dashboard-actions">
        <Link
          className={`earn-btn earn-btn-primary ${!depositsEnabled ? "pointer-events-none opacity-50" : ""}`}
          href="/earn?action=deposit"
        >
          <ArrowDownToLine className="h-4 w-4" />
          Move to Earn
        </Link>
        <Link className="earn-btn earn-btn-secondary" href="/earn?action=withdraw">
          <ArrowUpFromLine className="h-4 w-4" />
          Move to Balance
        </Link>
      </div>

      <p className="earn-footnote">
        One account — spendable wallet USDC and Earn vault shares. Yield is
        variable and not guaranteed.
      </p>
    </section>
  );
}
