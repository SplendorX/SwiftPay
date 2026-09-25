"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { countries, countryFlag, type Country } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * A searchable country picker: flag, name and dialling code. Styled like
 * StyledSelect, with a search box because the list is long.
 */
export function CountrySelect({
  ariaLabel = "Country",
  className,
  onChange,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  onChange: (country: Country) => void;
  value: Country | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    const wanted = query.trim().toLowerCase().replace(/^\+/, "");
    if (!wanted) return countries;
    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(wanted) ||
        country.code.toLowerCase() === wanted ||
        country.dial.slice(1).startsWith(wanted),
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      window.requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const pick = (country: Country) => {
    onChange(country);
    setOpen(false);
  };

  return (
    <div
      className={cn("styled-select-root relative w-full min-w-0", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="styled-select-trigger inline-flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 text-left text-sm font-medium text-foreground shadow-sm transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          {value ? (
            <>
              <span aria-hidden className="text-base leading-none">{countryFlag(value.code)}</span>
              <span className="truncate">{value.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select a country</span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="styled-select-menu absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-border bg-card shadow-[0_18px_40px_-22px_rgba(15,23,42,0.28)]">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search countries"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches[0]) {
                  event.preventDefault();
                  pick(matches[0]);
                }
              }}
              placeholder="Search by name or code"
              ref={searchRef}
              value={query}
            />
          </div>
          <div className="max-h-60 overflow-y-auto" role="listbox">
            {matches.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-muted-foreground">No country matches.</p>
            ) : (
              matches.map((country) => (
                <button
                  aria-selected={country.code === value?.code}
                  className={cn(
                    "styled-select-option flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary focus:outline-none",
                    country.code === value?.code
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-foreground",
                  )}
                  key={country.code}
                  onClick={() => pick(country)}
                  role="option"
                  type="button"
                >
                  <span aria-hidden className="text-base leading-none">{countryFlag(country.code)}</span>
                  <span className="min-w-0 flex-1 truncate">{country.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{country.dial}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
