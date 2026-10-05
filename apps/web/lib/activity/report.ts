// Server-only. Everything an account did in a period: SwiftPay's own records
// merged with the wallet's (and its ALLIE Agent Wallet's) on-chain transfers.
// Shared by statements and Insights.
import { isAddress } from "viem";

import { loadAgentWalletConfig } from "@/lib/agent-wallet/config";
import { mergeAccountActivity, type AccountActivityItem } from "@/lib/activity/merge";
import { listAccountActivity } from "@/lib/activity/service";
import { fetchArcScanTransfers, type WalletTransfer } from "@/lib/arcscan-history";
import { isArcMainnet } from "@/lib/network";
import { walletHistoryFromRpc } from "@/lib/wallet-history";

/** Rows read per feature, and on-chain transfers per wallet, for one report. */
const REPORT_LIMIT = 5_000;

function inRange(at: string | null | undefined, from: Date, to: Date) {
  const time = at ? Date.parse(at) : Number.NaN;
  return !Number.isNaN(time) && time >= from.getTime() && time <= to.getTime();
}

/**
 * On-chain transfers in a period. Mainnet reads the Arc RPC store (the
 * explorer API blocks servers there); testnet the explorer, which lists only
 * the newest transfers, falling back to the store.
 */
async function transfersFor(wallet: string, from: Date, to: Date): Promise<WalletTransfer[]> {
  const fromStore = () => walletHistoryFromRpc(wallet, { from, limit: REPORT_LIMIT, to });
  if (isArcMainnet()) return fromStore();
  try {
    return (await fetchArcScanTransfers(wallet)).filter((transfer) => inRange(transfer.timestamp, from, to));
  } catch {
    return fromStore();
  }
}

/** Every dated activity between `from` and `to` (inclusive), newest first. */
export async function loadActivityItems(
  wallet: string,
  range: { from: Date; to: Date },
): Promise<AccountActivityItem[]> {
  const { from, to } = range;
  const [entries, own, agentWallet] = await Promise.all([
    listAccountActivity(wallet, { from, limit: REPORT_LIMIT, to }),
    transfersFor(wallet, from, to),
    loadAgentWalletConfig(wallet).catch(() => null),
  ]);

  // ALLIE pays from the Agent Wallet: its transfers belong to this account too.
  const agentTransfers =
    agentWallet?.walletAddress && isAddress(agentWallet.walletAddress)
      ? (await transfersFor(agentWallet.walletAddress, from, to).catch(() => [])).map((transfer) => ({
          ...transfer,
          viaAgentWallet: true,
        }))
      : [];

  return mergeAccountActivity(entries, [...own, ...agentTransfers]).filter((item) =>
    inRange(item.occurredAt, from, to),
  );
}
