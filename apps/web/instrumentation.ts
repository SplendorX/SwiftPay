export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startRecurringDevScheduler } = await import(
    "@/lib/recurring/dev-scheduler"
  );
  startRecurringDevScheduler();
}
