import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

import {
  fetchArcScanTransfers,
  type WalletTransfer,
} from "@/lib/arcscan-history";
import { loadAgentWalletConfig } from "@/lib/agent-wallet/config";

function toTime(value: string | null) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { message: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  try {
    const transfers = await fetchArcScanTransfers(address);

    // ALLIE pays from the Agent Wallet, so those transfers never appear in the
    // primary wallet's history. Merge them in — they are the same person's
    // money, and it is all public chain data either way.
    let agentTransfers: WalletTransfer[] = [];

    try {
      const agentWallet = await loadAgentWalletConfig(address);

      if (agentWallet?.walletAddress && isAddress(agentWallet.walletAddress)) {
        agentTransfers = (
          await fetchArcScanTransfers(agentWallet.walletAddress)
        ).map((transfer) => ({ ...transfer, viaAgentWallet: true }));
      }
    } catch {
      // A missing or unreachable agent wallet must never break the main
      // history — the primary wallet's transfers still return.
    }

    const seen = new Set<string>();
    const items = [...transfers, ...agentTransfers]
      .filter((transfer) => {
        const key = `${transfer.hash}:${transfer.direction}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach ArcScan right now." },
      { status: 502 },
    );
  }
}
