export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initNodeInstrumentation } = await import("./instrumentation.node");
    await initNodeInstrumentation();
  }
}
