import { progressPercent, formatUnitsToDecimal } from "@/lib/save/decimal";
import { getPocketEmoji, type SavingsPocketRecord } from "@/lib/save/types";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";

export function formatMoney(
  amount: string | null | undefined,
  currency: ArcTokenSymbol = "USDC",
) {
  if (!amount) return `$0.00`;
  const [w, f = ""] = amount.split(".");
  const frac = (f + "00").slice(0, 2);
  return `$${w}.${frac} ${currency}`;
}

export function formatMoneyShort(amount: string | null | undefined) {
  if (!amount) return "$0.00";
  const [w, f = ""] = amount.split(".");
  return `$${w}.${(f + "00").slice(0, 2)}`;
}

export function pocketProgress(pocket: SavingsPocketRecord) {
  const current = BigInt(pocket.current_balance_units || "0");
  const target = pocket.target_amount_units
    ? BigInt(pocket.target_amount_units)
    : null;
  return progressPercent(current, target);
}

export function pocketLabel(pocket: SavingsPocketRecord) {
  return `${getPocketEmoji(pocket.icon)} ${pocket.name}`;
}

export function unitsLabel(units: string, currency: ArcTokenSymbol) {
  const decimals = arcTestnetTokens[currency].decimals;
  return formatUnitsToDecimal(BigInt(units || "0"), decimals);
}

export function groupByDay<T extends { created_at: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = new Date(item.created_at).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const list = groups.get(day) ?? [];
    list.push(item);
    groups.set(day, list);
  }
  return Array.from(groups.entries());
}
