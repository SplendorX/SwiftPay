"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const defaultPageSize = 8;

export function PagedActivityBox<T>({
  className,
  empty,
  items,
  pageSize = defaultPageSize,
  renderItem,
  title,
}: {
  className?: string;
  empty: ReactNode;
  items: T[];
  pageSize?: number;
  renderItem: (item: T, index: number) => ReactNode;
  title: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

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
