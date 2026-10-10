import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

import {
  fetchArcScanTransfers,
  type WalletTransfer,
} from "@/lib/arcscan-history";
import { loadAgentWalletConfig } from "@/lib/agent-wallet/config";
import { activityWindowStart, clampActivityDays } from "@/lib/activity/types";
import { mintSenders, type MintSender } from "@/lib/multichain/senders";
import { isArcMainnet } from "@/lib/network";
import { consumeRateLimit } from "@/lib/rate-limit";
import { walletHistoryFromRpc } from "@/lib/wallet-history";

export const runtime = "nodejs";

function toTime(value: string | null) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * One wallet's transfers. The explorer API answers servers with a Cloudflare
 * challenge on mainnet, so mainnet reads the Arc RPC (kept in a table, see
 * lib/wallet-history). Testnet keeps the explorer's full history and falls
 * back to the RPC if the explorer is down.
 */
const zeroAddress = "0x0000000000000000000000000000000000000000";

/**
 * USDC swept in from another network lands as a CCTP mint, so the chain names
 * no sender. Label those with the payer on that network ("0x6f97…464f on Base").
 * Best effort: the plain transfer still shows if the lookup fails.
 */
async function labelSweptMints(address: string, transfers: WalletTransfer[]) {
  const mints = transfers.filter(
    (transfer) => transfer.direction === "in" && transfer.counterparty.toLowerCase() === zeroAddress,
  );
  if (mints.length === 0) return transfers;
  const senders = await mintSenders(address, mints.map((transfer) => transfer.hash)).catch(() => ({}) as Record<string, MintSender>);
  return transfers.map((transfer) => {
    const from = transfer.direction === "in" ? senders[transfer.hash.toLowerCase()] : undefined;
    return from ? { ...transfer, counterpartyLabel: from.label } : transfer;
  });
}

async function walletTransfers(address: string, days: number | null) {
  // A window (Transaction History's three months) reads further than the
  // default newest-100.
  const options = days ? { from: activityWindowStart(Date.now(), days), limit: 1_000 } : undefined;
  if (isArcMainnet()) return walletHistoryFromRpc(address, options);
  try {
    return await fetchArcScanTransfers(address);
  } catch {
    return walletHistoryFromRpc(address, options);
  }
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? clampActivityDays(daysParam) : null;

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { message: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  // Each read can touch the RPC and store rows: keep any one caller modest.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await consumeRateLimit(`wallet-history:${ip}`, 60, 60))) {
    return NextResponse.json(
      { message: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  try {
    const transfers = await labelSweptMints(address, await walletTransfers(address, days));

    // ALLIE pays from the Agent Wallet, so those transfers never appear in the
    // primary wallet's history. Merge them in — they are the same person's
    // money, and it is all public chain data either way.
    let agentTransfers: WalletTransfer[] = [];

    try {
      const agentWallet = await loadAgentWalletConfig(address);

      if (agentWallet?.walletAddress && isAddress(agentWallet.walletAddress)) {
        agentTransfers = (await walletTransfers(agentWallet.walletAddress, days)).map(
          (transfer) => ({ ...transfer, viaAgentWallet: true }),
        );
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

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { message: "Wallet history couldn't be loaded right now." },
      { status: 502 },
    );
  }
}
