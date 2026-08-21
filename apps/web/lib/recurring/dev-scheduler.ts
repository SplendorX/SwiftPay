const TICK_MS = 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __swiftpayRecurringDevScheduler: ReturnType<typeof setInterval> | undefined;
}

/**
 * Local/dev only. Vercel cron does not run inside `next dev`, so Autopay would
 * sit in DUE forever after authorize. Production uses /api/cron/recurring.
 */
export function startRecurringDevScheduler() {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL === "1") {
    return;
  }

  if (globalThis.__swiftpayRecurringDevScheduler) {
    return;
  }

  const tick = async () => {
    try {
      const { runAutopayTick } = await import("@/lib/recurring/tick");
      await runAutopayTick({ enqueueLimit: 10, workerLimit: 10 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Autopay local tick failed.";
      console.warn("[recurring-dev-scheduler]", message);
    }
  };

  void tick();
  globalThis.__swiftpayRecurringDevScheduler = setInterval(() => {
    void tick();
  }, TICK_MS);
}
