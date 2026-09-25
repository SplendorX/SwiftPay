"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const defaultPageSize = 8;

export type ActivityFilter = {
  count: number;
  id: string;
  label: string;
};

export function PagedActivityBox<T>({
  activeFilter,
  className,
  empty,
  filters,
  items,
  onFilterChange,
  pageSize = defaultPageSize,
  renderItem,
  title,
}: {
  activeFilter?: string;
  className?: string;
  empty: ReactNode;
  /** Optional segmented filter shown beside the title. */
  filters?: ActivityFilter[];
  items: T[];
  onFilterChange?: (id: string) => void;
  pageSize?: number;
  renderItem: (item: T, index: number) => ReactNode;
  title: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  // Changing the filter changes what page 1 means, so go back to the start
  // rather than stranding the reader on an empty page.
  useEffect(() => {
    setPage(0);
  }, [activeFilter]);

  const pageItems = useMemo(() => {
    const start = page * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const rangeStart = items.length === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min(items.length, (page + 1) * pageSize);

  return (
    <section
      className={cn(
        "surface-panel flex min-w-0 flex-col overflow-hidden p-4 sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {items.length > 0 ? (
          <p className="shrink-0 text-[11px] text-muted-foreground">
            {rangeStart}–{rangeEnd} of {items.length}
          </p>
        ) : null}
      </div>

      {filters && filters.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {filters.map((filter) => {
            const active = filter.id === activeFilter;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
                key={filter.id}
                onClick={() => onFilterChange?.(filter.id)}
                type="button"
              >
                {filter.label}
                <span
                  className={cn(
                    "tabular-nums",
                    active ? "opacity-80" : "opacity-60",
                  )}
                >
                  {filter.count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="h-64 overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-border bg-muted/40 p-2 sm:h-72">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pageItems.map((item, index) => renderItem(item, index))}
          </div>
        )}
      </div>

      {items.length > pageSize ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <Button
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            size="sm"
            type="button"
            variant="outline"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <Button
            disabled={page >= totalPages - 1}
            onClick={() =>
              setPage((current) => Math.min(totalPages - 1, current + 1))
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
