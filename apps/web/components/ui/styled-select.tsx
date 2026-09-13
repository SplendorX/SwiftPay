"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type StyledSelectOption<T extends string> = {
  label: string;
  value: T;
};

export function StyledSelect<T extends string>({
  ariaLabel = "Select option",
  className,
  triggerClassName,
  onChange,
  options,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
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
        className={cn(
          "styled-select-trigger inline-flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 text-left text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20",
          triggerClassName,
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Select"}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          className="styled-select-menu absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-[0_18px_40px_-22px_rgba(15,23,42,0.28)]"
          role="listbox"
        >
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={cn(
                "styled-select-option flex w-full items-center px-3.5 py-2.5 text-left text-sm font-medium transition hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary focus:outline-none",
                option.value === value
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-foreground",
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
