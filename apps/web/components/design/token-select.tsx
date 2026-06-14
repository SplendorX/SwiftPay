"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { TokenIcon } from "@/components/token-icon";
import {
  arcTestnetTokens,
  arcTokenSymbols,
  type ArcTokenSymbol,
} from "@/lib/tokens";
import { cn } from "@/lib/utils";

type TokenSelectProps = {
  className?: string;
  disabled?: boolean;
  exclude?: ArcTokenSymbol | ArcTokenSymbol[];
  id?: string;
  label?: string;
  onChange: (value: ArcTokenSymbol) => void;
  size?: "sm" | "md";
  value: ArcTokenSymbol;
};

function normalizeExclude(
  exclude?: ArcTokenSymbol | ArcTokenSymbol[],
): ArcTokenSymbol[] {
  if (!exclude) {
    return [];
  }

  return Array.isArray(exclude) ? exclude : [exclude];
}

export function TokenSelect({
  className,
  disabled = false,
  exclude,
  id,
  label,
  onChange,
  size = "md",
  value,
}: TokenSelectProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const excluded = normalizeExclude(exclude);
  const options = arcTokenSymbols.filter((symbol) => !excluded.includes(symbol));
  const selected = arcTestnetTokens[value];

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectToken(symbol: ArcTokenSymbol) {
    onChange(symbol);
    setOpen(false);
  }

  return (
    <div className={cn("grid gap-2", className)} ref={rootRef}>
      {label ? (
        <span className="text-sm font-semibold text-foreground" id={`${controlId}-label`}>
          {label}
        </span>
      ) : null}

      <div className="relative">
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby={label ? `${controlId}-label` : undefined}
          className={cn(
            "token-select-trigger field-shell flex w-full items-center gap-2.5 px-3 text-left outline-none transition",
            "hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15",
            size === "sm" ? "h-11" : "h-12",
            disabled && "cursor-not-allowed opacity-60",
          )}
          disabled={disabled}
          id={controlId}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <TokenIcon
            className={cn(
              "shrink-0 rounded-full shadow-sm",
              size === "sm" ? "h-6 w-6" : "h-7 w-7",
            )}
            symbol={value}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {selected.symbol}
            </span>
            <span className="block truncate text-[11px] font-medium text-muted-foreground">
              {selected.name}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition",
              open && "rotate-180",
            )}
          />
        </button>

        {open ? (
          <div
            className="token-select-menu absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-lg"
            role="listbox"
          >
            {options.map((symbol) => {
              const token = arcTestnetTokens[symbol];
              const isSelected = symbol === value;

              return (
                <button
                  aria-selected={isSelected}
                  className={cn(
                    "token-select-option flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition",
                    isSelected
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                  key={symbol}
                  onClick={() => selectToken(symbol)}
                  role="option"
                  type="button"
                >
                  <TokenIcon className="h-8 w-8 shrink-0 rounded-full shadow-sm" symbol={symbol} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{token.symbol}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {token.name}
                    </span>
                  </span>
                  {isSelected ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}