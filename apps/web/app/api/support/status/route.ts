import { NextResponse } from "next/server";

import { createArcRpcClient } from "@/lib/arc-transfers";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type ServiceStatus = {
  /** "operational" when every check passed, "degraded" when one failed. */
  status: "operational" | "degraded";
  checkedAt: string;
  issues: string[];
};

const CACHE_MS = 60_000;
const CHECK_TIMEOUT_MS = 4_000;
let cached: { at: number; value: ServiceStatus } | null = null;

function withTimeout<T>(promise: PromiseLike<T>) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS)),
  ]);
}

/**
 * The status line on the Support panel: can SaphraONE reach its database and
 * the Arc network right now. Real checks, cached for a minute per instance,
 * so the panel never claims "all systems operational" on its own say-so.
 */
async function checkStatus(): Promise<ServiceStatus> {
  const issues: string[] = [];
  const [database, arc] = await Promise.allSettled([
    withTimeout(
      createSupabaseAdminClient()
        .from(process.env.SUPABASE_PROFILES_TABLE ?? "profiles")
        .select("wallet_address", { count: "exact", head: true })
        .limit(1)
        .then(({ error }) => {
          if (error) throw error;
        }),
    ),
    withTimeout(createArcRpcClient().getBlockNumber()),
  ]);
  if (database.status === "rejected") issues.push("Account data is slow to load.");
  if (arc.status === "rejected") issues.push("The Arc network is slow to respond; payments may take longer.");
  return {
    checkedAt: new Date().toISOString(),
    issues,
    status: issues.length === 0 ? "operational" : "degraded",
  };
}

export async function GET() {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    cached = { at: Date.now(), value: await checkStatus() };
  }
  return NextResponse.json(cached.value, {
    headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
  });
}
