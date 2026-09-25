"use client";

export function PayrollDashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Action bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-lg bg-muted" />
          <div className="h-4 w-72 rounded-md bg-muted/60" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-36 rounded-lg bg-muted/70" />
          <div className="h-8 w-32 rounded-lg bg-muted" />
        </div>
      </div>

      {/* Hero */}
      <div className="min-h-[188px] rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="h-3 w-32 rounded bg-muted" />
            <div className="h-11 w-64 rounded-lg bg-muted" />
            <div className="flex gap-3 pt-1">
              <div className="h-7 w-32 rounded-lg bg-muted/60" />
              <div className="h-7 w-28 rounded-lg bg-muted/60" />
            </div>
          </div>
          <div className="lg:col-span-5 h-28 rounded-xl bg-muted/40" />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 space-y-3 rounded-xl border border-border bg-card p-5">
            <div className="h-3 w-28 rounded bg-muted" />
            <div className="h-7 w-24 rounded bg-muted" />
            <div className="h-3 w-20 rounded bg-muted/60" />
          </div>
        ))}
      </div>

      {/* Runs + shortcuts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-80 rounded-2xl border border-border bg-card lg:col-span-2" />
        <div className="h-80 rounded-2xl border border-border bg-card" />
      </div>
    </div>
  );
}
