"use client";

import { Delete } from "lucide-react";

import { formatMoney } from "@/lib/account/money";
import { cn } from "@/lib/utils";

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

/** Appends a keypad press to an amount string, keeping at most 2 decimals. */
export function pressAmountKey(current: string, key: (typeof keys)[number]) {
  if (key === "back") return current.slice(0, -1);
  if (key === ".") {
    if (current.includes(".")) return current;
    return current ? `${current}.` : "0.";
  }
  if (current === "0") return key;
  const [, decimals] = current.split(".");
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (current.replace(".", "").length >= 9) return current;
  return `${current}${key}`;
}

/** A big amount readout and a phone-style keypad, for counter use. */
export function AmountKeypad({
  value,
  onChange,
  currency,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  currency: "USDC" | "EURC";
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <p
        aria-live="polite"
        className={cn(
          "text-center font-heading text-5xl tabular-nums sm:text-6xl",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {formatMoney(value || "0", currency)}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            aria-label={key === "back" ? "Delete" : key}
            className="flex h-14 items-center justify-center rounded-xl bg-muted/60 text-xl font-medium tabular-nums transition-colors hover:bg-muted active:bg-muted/80 disabled:opacity-50"
            disabled={disabled}
            key={key}
            onClick={() => onChange(pressAmountKey(value, key))}
            type="button"
          >
            {key === "back" ? <Delete className="h-5 w-5" /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}
