import { NextResponse, type NextRequest } from "next/server";

import { fetchAaveApy } from "@/lib/earn/aave-apy";
import { processDueAutoSaveRules } from "@/lib/earn/auto-save";
import { earnConfig } from "@/lib/earn/config";
import { indexEarnVaultEvents } from "@/lib/earn/indexer";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { arcTestnetTokens } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";
import type { Address } from "viem";

export const runtime = "nodejs";

const snapshotsTable =
  process.env.SUPABASE_EARN_APY_SNAPSHOTS_TABLE ?? "earn_apy_snapshots";

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const indexResult = await indexEarnVaultEvents({ maxBlocks: 8_000 });
    const autoSaveResult = await processDueAutoSaveRules();

    const apy = await fetchAaveApy({
      pool: earnConfig.aavePoolAddress,
      asset: arcTestnetTokens.USDC.address as Address,
      feeBps: earnConfig.performanceFeeBps,
      mode: earnConfig.mode,
    });

    if (earnConfig.strategyAddress) {
      try {
        const supabase = createSupabaseAdminClient();
        await supabase.from(snapshotsTable).insert({
          chain_id: arcTestnet.id,
          strategy_address: earnConfig.strategyAddress.toLowerCase(),
          gross_apy_bps: apy.grossApyBps,
          net_apy_bps: apy.netApyBps,
          underlying_apy_bps: apy.underlyingApyBps,
          data_source: apy.dataSource,
          is_estimate: apy.isEstimate,
          is_simulation: apy.isSimulation,
          captured_at: apy.capturedAt,
        });
      } catch {
        // optional
      }
    }

    return NextResponse.json({
      status: "ok",
      index: indexResult,
      autoSave: autoSaveResult,
      apy: {
        dataSource: apy.dataSource,
        grossApyBps: apy.grossApyBps,
        netApyBps: apy.netApyBps,
        message: apy.message,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Earn cron failed.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
