import { NextResponse } from "next/server";

import { earnConfig, earnModeBanner } from "@/lib/earn/config";

/**
 * Public Earn status — config + mode only.
 * Financial balances must be read on-chain by the client.
 */
export async function GET() {
  const banner = earnModeBanner(earnConfig.mode);

  return NextResponse.json({
    mode: earnConfig.mode,
    depositsEnabled: earnConfig.mode === "live" || earnConfig.mode === "simulation",
    banner,
    protocol: {
      name: earnConfig.protocolName,
      performanceFeeBps: earnConfig.performanceFeeBps,
    },
    addresses: {
      vault: earnConfig.vaultAddress,
      strategy: earnConfig.strategyAddress,
      aavePool: earnConfig.aavePoolAddress,
      aToken: earnConfig.aTokenAddress,
    },
    notes: {
      sourceOfTruth: "on-chain",
      apy: "Never hard-coded. Live mode sources from Aave when configured; simulation shows N/A.",
      mainnetSwitch:
        "Set NEXT_PUBLIC_EARN_MODE=live and verified AAVE_POOL / ATOKEN / VAULT addresses after Arc mainnet Aave deploy.",
    },
  });
}
