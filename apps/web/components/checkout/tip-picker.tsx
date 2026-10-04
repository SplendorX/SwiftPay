"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { formatMoney, moneyNumber, roundMoney } from "@/lib/account/money";
import { cn } from "@/lib/utils";

const presets = [0, 10, 15, 20] as const;

/** Tip presets (0/10/15/20%) and a custom amount. `onChange` gets the tip as a decimal string. */
export function TipPicker({
  amount,
  currency,
  value,
  onChange,
  disabled,
}: {
  amount: string;
  currency: "USDC" | "EURC";
  value: string;
  onChange: (tip: string) => void;
  disabled?: boolean;
}) {
  const base = moneyNumber(amount);
  const presetTip = (percent: number) => roundMoney(Math.round(base * percent) / 100);
  const matching = presets.find((percent) => presetTip(percent) === roundMoney(moneyNumber(value || "0")));
  const [custom, setCustom] = useState(matching === undefined && moneyNumber(value || "0") > 0);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Add a tip</p>
      <div className="grid grid-cols-5 gap-1.5">
        {presets.map((percent) => {
          const active = !custom && matching === percent;
          return (
            <button
              className={cn(
                "rounded-lg border px-1 py-2 text-sm font-medium transition-colors disabled:opacity-50",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
              disabled={disabled}
              key={percent}
              onClick={() => {
                setCustom(false);
                onChange(presetTip(percent));
              }}
              type="button"
            >
              {percent === 0 ? "None" : `${percent}%`}
            </button>
          );
        })}
        <button
          className={cn(
            "rounded-lg border px-1 py-2 text-sm font-medium transition-colors disabled:opacity-50",
            custom ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
          )}
          disabled={disabled}
          onClick={() => setCustom(true)}
          type="button"
        >
          Other
        </button>
      </div>
      {custom ? (
        <div className="relative">
          <Input
            autoFocus
            className="h-11 pr-16 tabular-nums"
            disabled={disabled}
            inputMode="decimal"
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d.]/g, "");
              if (/^\d*(\.\d{0,2})?$/.test(next)) onChange(next);
            }}
            placeholder="0.00"
            value={value === "0" ? "" : value}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {currency}
          </span>
        </div>
      ) : matching !== undefined && matching > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatMoney(presetTip(matching), currency)} tip
        </p>
      ) : null}
    </div>
  );
}
