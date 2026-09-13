import { formatUnits, parseUnits } from "viem";
import { swiftBatchFeeBasisPoints } from "@/lib/contracts";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";

const DEFAULT_DECIMALS = 6; // USDC & EURC on Arc have 6 decimals
const BPS_DENOMINATOR = BigInt(10_000);
const FEE_BPS = BigInt(swiftBatchFeeBasisPoints); // 100 bps = 1%

export function getAssetDecimals(asset: string): number {
  if (asset in arcTestnetTokens) {
    return arcTestnetTokens[asset as ArcTokenSymbol].decimals;
  }
  return DEFAULT_DECIMALS;
}

export function parseAssetUnits(amountStr: string, asset = "USDC"): bigint {
  const decimals = getAssetDecimals(asset);
  const clean = amountStr.trim();
  if (!clean) return BigInt(0);
  try {
    const units = parseUnits(clean, decimals);
    return units < BigInt(0) ? BigInt(0) : units;
  } catch {
    throw new Error(`Invalid amount format: "${amountStr}"`);
  }
}

export function formatAssetUnits(units: bigint, asset = "USDC"): string {
  const decimals = getAssetDecimals(asset);
  return formatUnits(units, decimals);
}

export type CalculatedItem = {
  baseUnits: bigint;
  adjustmentUnits: bigint;
  totalUnits: bigint;
  baseAmount: string;
  adjustmentAmount: string;
  totalAmount: string;
};

export function calculateItemAmounts(
  baseAmount: string,
  adjustments: Array<{ type: "BONUS" | "DEDUCTION" | "MANUAL_ADJUSTMENT"; amount: string }>,
  asset = "USDC",
): CalculatedItem {
  const baseUnits = parseAssetUnits(baseAmount, asset);
  let adjustmentUnits = BigInt(0);

  for (const adj of adjustments) {
    const adjUnits = parseAssetUnits(adj.amount, asset);
    if (adj.type === "DEDUCTION") {
      adjustmentUnits -= adjUnits;
    } else {
      adjustmentUnits += adjUnits;
    }
  }

  let totalUnits = baseUnits + adjustmentUnits;
  if (totalUnits < BigInt(0)) {
    totalUnits = BigInt(0);
  }

  const absAdjUnits = adjustmentUnits < BigInt(0) ? -adjustmentUnits : adjustmentUnits;
  const adjSign = adjustmentUnits < BigInt(0) ? "-" : "";

  return {
    baseUnits,
    adjustmentUnits,
    totalUnits,
    baseAmount: formatAssetUnits(baseUnits, asset),
    adjustmentAmount: `${adjSign}${formatAssetUnits(absAdjUnits, asset)}`,
    totalAmount: formatAssetUnits(totalUnits, asset),
  };
}

export type CalculatedRun = {
  totalAmountUnits: bigint;
  totalFeesUnits: bigint;
  totalRequiredUnits: bigint;
  totalAmount: string;
  totalFees: string;
  totalRequired: string;
  recipientCount: number;
};

export function calculateRunTotals(
  items: Array<{ totalAmount: string }>,
  asset = "USDC",
): CalculatedRun {
  let totalAmountUnits = BigInt(0);

  for (const item of items) {
    totalAmountUnits += parseAssetUnits(item.totalAmount, asset);
  }

  const totalFeesUnits = (totalAmountUnits * FEE_BPS) / BPS_DENOMINATOR;
  const totalRequiredUnits = totalAmountUnits + totalFeesUnits;

  return {
    totalAmountUnits,
    totalFeesUnits,
    totalRequiredUnits,
    totalAmount: formatAssetUnits(totalAmountUnits, asset),
    totalFees: formatAssetUnits(totalFeesUnits, asset),
    totalRequired: formatAssetUnits(totalRequiredUnits, asset),
    recipientCount: items.length,
  };
}
