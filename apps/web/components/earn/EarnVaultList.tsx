"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatApy,
  formatUsdGrouped,
  isActiveVault,
  isLowLiquidityVault,
  vaultName,
} from "@/lib/earn/display";
import type { EarnVault } from "@/lib/earn/types";
import { cn } from "@/lib/utils";

type EarnVaultListProps = {
  error?: string | null;
  loading?: boolean;
  onSelect: (vaultAddress: string) => void;
  selectedVaultAddress?: string | null;
  vaults: EarnVault[];
};

export function EarnVaultList({
  error,
  loading,
  onSelect,
  selectedVaultAddress,
  vaults,
}: EarnVaultListProps) {
  if (loading) {
    return (
      <div className="earn-connect-hint">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading available vaults…
      </div>
    );
  }

  if (error) {
    return <p className="earn-error">{error}</p>;
  }

  if (vaults.length === 0) {
    return (
      <p className="earn-footnote">
        No Earn vaults are available on Arc right now.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {vaults.map((vault) => {
        const address = vault.vaultAddress;
        const active = isActiveVault(vault.status);
        const lowLiquidity = isLowLiquidityVault(vault.status);
        const apy = formatApy(vault.currentApy);
        const tvl = formatUsdGrouped(vault.totalDeposits);
        const selected =
          selectedVaultAddress?.toLowerCase() === address.toLowerCase();

        return (
          <article
            className={cn(
              "earn-balance-card flex flex-col gap-4",
              !active || lowLiquidity ? "opacity-70" : "",
              selected ? "border-primary" : "",
            )}
            key={address}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-[family-name:var(--font-heading)] text-lg font-semibold tracking-tight">
                {vaultName(vault)}
              </h3>
              {active ? (
                <span className="earn-pill">Active</span>
              ) : vault.status ? (
                <span className="earn-pill">{vault.status.replaceAll("_", " ")}</span>
              ) : null}
            </div>

            {apy ? (
              <p className="text-3xl font-semibold tracking-tight text-primary">
                {apy} APY
              </p>
            ) : null}

            {tvl ? (
              <p className="text-sm text-muted-foreground">{tvl} supplied</p>
            ) : null}

            <p className="text-sm text-muted-foreground">Powered by Morpho</p>

            <Button
              className="mt-auto h-11 w-full text-sm font-semibold"
              onClick={() => onSelect(address)}
              type="button"
            >
              {selected ? "Selected" : "Select"}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
