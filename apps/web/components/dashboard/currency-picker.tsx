"use client";

import { AlertCircle, Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getCurrencyMeta,
  SUPPORTED_CURRENCIES,
  type SupportedCurrencyCode,
} from "@/lib/use-conversion-rates";

type CurrencyPickerProps = {
  className?: string;
  error?: string | null;
  isLoading?: boolean;
  onChange: (value: SupportedCurrencyCode) => void;
  onRefresh?: () => void;
  value: SupportedCurrencyCode;
};

export function CurrencyPicker({
  className,
  error = null,
  isLoading = false,
  onChange,
  onRefresh,
  value,
}: CurrencyPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selected = getCurrencyMeta(value);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Move focus into the list so arrow keys and screen readers land correctly.
  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLButtonElement>(
      '[aria-selected="true"]',
    );
    (active ?? listRef.current?.querySelector("button"))?.focus();
  }, [open]);

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();

    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    if (items.length === 0) return;

    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (index + step + items.length) % items.length;
    items[next]?.focus();
  }

  function select(code: SupportedCurrencyCode) {
    onChange(code);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={cn("grid gap-2", className)} ref={rootRef}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <button
            aria-controls={open ? listId : undefined}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary/40"
            onClick={() => setOpen((current) => !current)}
            ref={triggerRef}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-base leading-none">{selected.symbol}</span>
              <span className="truncate">
                {selected.code}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {selected.name}
                </span>
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>

          {open ? (
            <div
              aria-label="Display currency"
              className="floating-menu absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-64 overflow-y-auto rounded-lg border border-border p-1 shadow-lg"
              id={listId}
              onKeyDown={handleListKeyDown}
              ref={listRef}
              role="listbox"
            >
              {SUPPORTED_CURRENCIES.map((option) => {
                const isSelected = option.code === value;
                return (
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition",
                      isSelected
                        ? "bg-primary/10 font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                    key={option.code}
                    onClick={() => select(option.code)}
                    role="option"
                    type="button"
                  >
                    <span className="w-8 shrink-0 text-base leading-none">
                      {option.symbol}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{option.code}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {option.name}
                      </span>
                    </span>
                    {isSelected ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading rates
          </span>
        ) : error ? (
          <Button
            className="h-8 shrink-0 gap-1.5 border-amber-500/40 px-2.5 text-xs"
            onClick={onRefresh}
            size="sm"
            type="button"
            variant="outline"
          >
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            Retry rates
          </Button>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live rates
          </span>
        )}
      </div>

      {error ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {error} Amounts stay in USD until rates load.
        </p>
      ) : null}
    </div>
  );
}
