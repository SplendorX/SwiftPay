import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";

import { fetchAaveApy } from "@/lib/earn/aave-apy";
import { earnConfig } from "@/lib/earn/config";
import { bpsToPercentString } from "@/lib/earn/decimal";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { arcTestnetTokens } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

export const runtime = "nodejs";

const snapshotsTable =
  process.env.SUPABASE_EARN_APY_SNAPSHOTS_TABLE ?? "earn_apy_snapshots";

export async function GET() {
  const asset = arcTestnetTokens.USDC.address as Address;
  const live = await fetchAaveApy({
    pool: earnConfig.aavePoolAddress,
    asset,
    feeBps: earnConfig.performanceFeeBps,
    mode: earnConfig.mode,
  });

  // Persist snapshot when we have a strategy address (analytics only)
  if (earnConfig.strategyAddress) {
    try {
      const supabase = createSupabaseAdminClient();
      await supabase.from(snapshotsTable).insert({
        chain_id: arcTestnet.id,
        strategy_address: earnConfig.strategyAddress.toLowerCase(),
        gross_apy_bps: live.grossApyBps,
        net_apy_bps: live.netApyBps,
        underlying_apy_bps: live.underlyingApyBps,
        data_source: live.dataSource,
        is_estimate: live.isEstimate,
        is_simulation: live.isSimulation,
        captured_at: live.capturedAt,
      });
    } catch {
      // non-fatal — DB optional for read path
    }
  }

  let history: Array<{
    captured_at: string;
    gross_apy_bps: number | null;
    net_apy_bps: number | null;
    data_source: string;
  }> = [];

  try {
    if (earnConfig.strategyAddress) {
      const supabase = createSupabaseAdminClient();
      const { data } = await supabase
        .from(snapshotsTable)
        .select("captured_at, gross_apy_bps, net_apy_bps, data_source")
        .eq("strategy_address", earnConfig.strategyAddress.toLowerCase())
        .order("captured_at", { ascending: false })
        .limit(30);
      history = data ?? [];
    }
  } catch {
    history = [];
  }

  // Optional: vault totalAssets for transparency (on-chain)
  let totalAssets: string | null = null;
  if (earnConfig.vaultAddress) {
    try {
      const client = createPublicClient({
        chain: arcTestnet,
        transport: http(arcTestnet.rpcUrls.default.http[0]),
      });
      const assets = await client.readContract({
        address: earnConfig.vaultAddress,
        abi: [
          {
            type: "function",
            name: "totalAssets",
            stateMutability: "view",
            inputs: [],
            outputs: [{ type: "uint256" }],
          },
        ] as const,
        functionName: "totalAssets",
      });
      totalAssets = (assets as bigint).toString();
    } catch {
      totalAssets = null;
    }
  }

  return NextResponse.json({
    mode: earnConfig.mode,
    current: {
      ...live,
      grossApyDisplay: bpsToPercentString(live.grossApyBps),
      netApyDisplay: bpsToPercentString(live.netApyBps),
      underlyingApyDisplay: bpsToPercentString(live.underlyingApyBps),
      performanceFeeBps: earnConfig.performanceFeeBps,
    },
    history,
    totalAssetsUnits: totalAssets,
    disclaimer:
      earnConfig.mode === "live"
        ? "Estimated APY from protocol data. Yield is variable and not guaranteed."
        : earnConfig.mode === "simulation"
          ? "Simulation, no real economic yield."
          : "Real yield strategy unavailable on this network.",
  });
}
