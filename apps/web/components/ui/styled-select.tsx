"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type StyledSelectOption<T extends string> = {
  label: string;
  value: T;
};

export function StyledSelect<T extends string>({
  ariaLabel,
  className,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  options: StyledSelectOption<T>[];
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className={cn(
        "styled-select-root relative max-w-full min-w-[min(9rem,100%)]",
        className,
      )}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;

        if (!event.currentTarget.contains(nextTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="styled-select-trigger inline-flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 text-left text-sm font-semibold text-ink shadow-sm transition hover:border-swift-600/40 focus:outline-none focus:ring-2 focus:ring-swift-600/15"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Select"}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          className="styled-select-menu absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-lg border border-border bg-card shadow-[0_18px_40px_-22px_rgba(15,23,42,0.28)]"
          role="listbox"
        >
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={cn(
                "styled-select-option flex w-full items-center px-4 py-3 text-left text-sm font-semibold transition hover:bg-swift-600/10 hover:text-swift-700 focus:bg-swift-600/10 focus:text-swift-700 focus:outline-none",
                option.value === value
                  ? "bg-swift-600/10 text-swift-700"
                  : "text-ink",
              )}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
