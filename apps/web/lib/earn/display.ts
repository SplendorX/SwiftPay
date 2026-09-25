import { formatUsdcDisplay } from "@/lib/onchain-money";
import type { EarnAssetAmount, EarnVault } from "@/lib/earn/types";

export function formatApy(currentApy: unknown): string | null {
  if (typeof currentApy !== "number" || !Number.isFinite(currentApy)) {
    return null;
  }
  return `${(currentApy * 100).toFixed(2)}%`;
}

export function formatUsdGrouped(value?: string | null): string | null {
  if (!value || !value.trim()) return null;
  try {
    const display = formatUsdcDisplay(value);
    const negative = display.startsWith("-");
    const unsigned = negative ? display.slice(1) : display;
    const [whole = "0", fraction = "00"] = unsigned.replace(/^\$/, "").split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${negative ? "-" : ""}$${grouped}.${fraction}`;
  } catch {
    return value;
  }
}

export function vaultName(vault: Pick<EarnVault, "name" | "vaultAddress">) {
  return vault.name?.trim() || "USDC vault";
}

export function protocolLabel(protocol?: string) {
  const value = protocol?.trim();
  if (!value) return "MORPHO";
  return value.toUpperCase() === "MORPHO" ? "MORPHO" : value.toUpperCase();
}

export function isActiveVault(status?: string) {
  return (status ?? "active").toLowerCase() === "active";
}

export function isLowLiquidityVault(status?: string) {
  return (status ?? "").toLowerCase().includes("low_liquidity");
}

export function formatAssetAmount(value?: EarnAssetAmount | string | null) {
  if (!value) return null;
  if (typeof value === "string") {
    return formatUsdGrouped(value) ?? value;
  }
  const amount = value.amount;
  if (!amount) return null;
  const symbol = value.symbol?.trim();
  if (!symbol || symbol.toUpperCase() === "USDC") {
    const formatted = formatUsdGrouped(amount) ?? amount;
    return symbol ? `${formatted} ${symbol}` : formatted;
  }
  return `${amount} ${symbol}`;
}

export function formatFeeList(fees?: EarnAssetAmount[] | null) {
  if (!fees || fees.length === 0) return "None";
  return fees
    .map((fee) => {
      const amount = formatAssetAmount(fee);
      if (!amount) return null;
      const type = typeof fee.type === "string" ? fee.type : null;
      return type ? `${amount} (${type})` : amount;
    })
    .filter((item): item is string => Boolean(item))
    .join(", ");
}
