import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env"), override: false, quiet: true });
loadEnv({
  path: resolve(process.cwd(), ".env.local"),
  override: false,
  quiet: true,
});
loadEnv({
  path: resolve(process.cwd(), "../../.env"),
  override: false,
  quiet: true,
});

if (!process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS?.trim()) {
  process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS =
    "0xcBF3559D59b536cc3aB55C32e502F72Bd111588a";
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startRecurringDevScheduler } = await import(
    "@/lib/recurring/dev-scheduler"
  );
  startRecurringDevScheduler();
}
