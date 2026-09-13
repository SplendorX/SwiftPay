export async function initNodeInstrumentation() {
  try {
    const { startRecurringDevScheduler } = await import(
      "@/lib/recurring/dev-scheduler"
    );
    startRecurringDevScheduler();
  } catch (error) {
    console.warn("[instrumentation-node] Failed to start dev scheduler:", error);
  }
}
