"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

/**
 * What a customer sees when a page crashes: a plain explanation, a way to
 * retry, and a short reference — while the details go to the server log.
 */
export function CrashScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  const reference = (error.digest ?? Math.random().toString(36).slice(2, 8)).slice(0, 8).toUpperCase();

  useEffect(() => {
    void fetch("/api/client-errors", {
      body: JSON.stringify({
        digest: error.digest ?? reference,
        message: error.message,
        path: window.location.pathname,
        stack: error.stack,
      }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  }, [error, reference]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-heading text-xl font-semibold">This page hit a problem</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing was sent or changed. Try again — if it keeps happening, contact support with the reference below.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
            onClick={() => (reset ? reset() : window.location.reload())}
            type="button"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <a className="inline-flex h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold" href="/dashboard">
            Go to dashboard
          </a>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Reference <span className="font-mono">{reference}</span>
        </p>
      </div>
    </main>
  );
}
