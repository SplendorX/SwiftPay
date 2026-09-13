"use client";

export function BusinessOverviewSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-lg bg-muted" />
          <div className="h-4 w-72 rounded-md bg-muted/60" />
        </div>
        <div className="h-7 w-36 rounded-full bg-muted/70" />
      </div>

      {/* Balance Card Skeleton */}
      <div className="min-h-[220px] rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            <div className="h-4 w-40 rounded-md bg-muted" />
            <div className="h-12 w-64 rounded-lg bg-muted" />
            <div className="flex gap-3 pt-2">
              <div className="h-8 w-32 rounded-lg bg-muted/60" />
              <div className="h-8 w-32 rounded-lg bg-muted/60" />
            </div>
          </div>
          <div className="lg:col-span-5 xl:col-span-4 h-36 rounded-xl bg-muted/40" />
        </div>
      </div>

      {/* Quick Actions Skeleton */}
      <div className="flex flex-wrap gap-3">
        <div className="h-11 w-36 rounded-full bg-muted" />
        <div className="h-11 w-32 rounded-full bg-muted/70" />
        <div className="h-11 w-36 rounded-full bg-muted/70" />
        <div className="h-11 w-28 rounded-full bg-muted/70" />
        <div className="h-11 w-28 rounded-full bg-muted/70" />
      </div>

      {/* Metrics Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="h-3 w-28 rounded bg-muted" />
            <div className="h-7 w-36 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted/60" />
          </div>
        ))}
      </div>

      {/* Cash Flow Skeleton */}
      <div className="min-h-[400px] rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6">
        <div className="flex justify-between">
          <div className="space-y-2">
            <div className="h-6 w-32 rounded bg-muted" />
            <div className="h-4 w-60 rounded bg-muted/60" />
          </div>
          <div className="h-8 w-44 rounded-lg bg-muted" />
        </div>
        <div className="h-64 rounded-xl bg-muted/30" />
      </div>

      {/* Operations Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80 rounded-2xl border border-border bg-card p-6" />
        <div className="h-80 rounded-2xl border border-border bg-card p-6" />
      </div>
    </div>
  );
}
