import { isAddress, getAddress, parseUnits } from "viem";

import {
  formatUnitsToDecimal,
  parseDecimalToUnits,
} from "@/lib/save/decimal";
import {
  SAVINGS_NAME_MAX,
  SPEND_SAVE_MAX_PERCENT,
  SPEND_SAVE_MIN_PERCENT,
  POCKET_ICON_PRESETS,
  type PocketIconId,
} from "@/lib/save/types";
import {
  arcTestnetTokens,
  arcTokenSymbols,
  type ArcTokenSymbol,
} from "@/lib/tokens";

export function normalizeWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }
  return getAddress(value).toLowerCase();
}

export function normalizePocketName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > SAVINGS_NAME_MAX) return null;
  return name;
}

export function normalizeDescription(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (text.length > 280) return null;
  return text;
}

export function normalizeIcon(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "piggy";
  }
  const icon = value.trim();
  const known = POCKET_ICON_PRESETS.find(
    (item) => item.id === icon || item.emoji === icon,
  );
  if (known) return known.id as PocketIconId;
  // Custom emoji / short icon string
  if (icon.length <= 8) return icon;
  return "piggy";
}

export function normalizeImageUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  if (url.length > 250000) return null;
  if (
    !url.startsWith("https://") &&
    !url.startsWith("data:image/") &&
    !url.startsWith("/")
  ) {
    return null;
  }
  return url;
}

export function isArcTokenSymbol(value: string): value is ArcTokenSymbol {
  return arcTokenSymbols.includes(value as ArcTokenSymbol);
}

export function normalizeCurrency(value: unknown): ArcTokenSymbol {
  if (typeof value === "string" && isArcTokenSymbol(value)) {
    return value;
  }
  return "USDC";
}

export function normalizeAmount(
  amount: unknown,
  tokenSymbol: ArcTokenSymbol,
): { amount: string; amount_units: string } | null {
  if (typeof amount !== "string" && typeof amount !== "number") {
    return null;
  }

  const text =
    typeof amount === "number" ? amount.toString() : amount.trim();

  if (!text || Number(text) <= 0) {
    return null;
  }

  try {
    const decimals = arcTestnetTokens[tokenSymbol].decimals;
    const units = parseUnits(text, decimals);
    if (units <= 0n) return null;
    // Canonical decimal from units (avoids "1.0" vs "1.00" drift)
    const canonical = formatUnitsToDecimal(units, decimals);
    return {
      amount: canonical,
      amount_units: units.toString(),
    };
  } catch {
    return null;
  }
}

export function normalizeOptionalTarget(
  amount: unknown,
  tokenSymbol: ArcTokenSymbol,
): { amount: string; amount_units: string } | null {
  if (amount === null || amount === undefined || amount === "") {
    return null;
  }
  return normalizeAmount(amount, tokenSymbol);
}

export function normalizePercentage(value: unknown): string | null {
  let text: string;
  if (typeof value === "number" && Number.isFinite(value)) {
    text = value.toFixed(2).replace(/\.?0+$/, "") || "0";
    // keep up to 2 decimals
    text = Number(value).toFixed(2);
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    return null;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [w, f = ""] = text.split(".");
  const hundredths = Number(w) * 100 + Number((f + "00").slice(0, 2));
  if (
    hundredths < SPEND_SAVE_MIN_PERCENT * 100 ||
    hundredths > SPEND_SAVE_MAX_PERCENT * 100
  ) {
    return null;
  }

  // Canonical two-decimal string
  const whole = Math.floor(hundredths / 100);
  const frac = (hundredths % 100).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

export function unitsToBigInt(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function amountFromUnits(
  units: bigint,
  tokenSymbol: ArcTokenSymbol,
): string {
  return formatUnitsToDecimal(units, arcTestnetTokens[tokenSymbol].decimals);
}

export function parseAmountUnits(
  amount: string,
  tokenSymbol: ArcTokenSymbol,
): bigint {
  return parseDecimalToUnits(amount, arcTestnetTokens[tokenSymbol].decimals);
}

export function isValidTxHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 128) return null;
  return key;
}
