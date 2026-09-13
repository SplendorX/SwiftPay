"use client";

import type { AssetBreakdownItem } from "./types";

type BalanceAssetBreakdownProps = {
  assets: AssetBreakdownItem[];
};

export function BalanceAssetBreakdown({ assets }: BalanceAssetBreakdownProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      {assets.map((asset) => {
        const isUSDC = asset.symbol === "USDC";
        return (
          <div
            key={asset.symbol}
            className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-background/60 px-3 py-1.5 text-xs sm:text-sm font-medium text-foreground transition-colors hover:bg-background"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs ${
                isUSDC ? "bg-[#2775CA]" : "bg-[#1E4D8C]"
              }`}
            >
              {isUSDC ? "$" : "€"}
            </span>
            <span className="font-semibold">{asset.formatted}</span>
            <span className="text-xs text-muted-foreground">{asset.symbol}</span>
          </div>
        );
      })}
    </div>
  );
}
