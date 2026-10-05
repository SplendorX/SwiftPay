import type { Hash } from "viem";

import { fetchArcScanTransfers } from "@/lib/arcscan-history";
import { isArcMainnet } from "@/lib/network";
import {
  evaluateReferralProgressAndQualify,
  loadReferralVolumes,
  readLastSyncedAt,
  referralContribution,
  type ReferralProgressContribution,
} from "@/lib/referral/qualification-service";
import type { ReferralRecord } from "@/lib/referral/types";
import { verifyWalletOutflow } from "@/lib/referral/verify-activity";
import { walletHistoryFromRpc } from "@/lib/wallet-history";

/** A referral is re-read from the chain at most this often. */
const syncCooldownMs = 60_000;
/** Receipts verified per sync; the rest are picked up by the next one. */
const maxVerificationsPerSync = 25;

function toTime(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The invitee's outgoing transfers since sign-up, fee legs included (the
 * receipt check below decides what counts). Mainnet reads the Arc RPC store,
 * because the explorer API blocks servers there; testnet keeps the explorer
 * and falls back to the store.
 */
async function outgoingTransfersSince(wallet: string, since: number) {
  const fromStore = () =>
    walletHistoryFromRpc(wallet, {
      direction: "out",
      from: new Date(since),
      includePlatformFees: true,
      limit: 1_000,
    });
  if (isArcMainnet()) return fromStore();
  try {
    return await fetchArcScanTransfers(wallet, { hidePlatformFees: false });
  } catch {
    return fromStore();
  }
}

export function needsReferralSync(referral: ReferralRecord, now = Date.now()) {
  if (
    referral.status === "QUALIFIED" ||
    referral.status === "REWARDED" ||
    referral.status === "FRAUD_REVIEW" ||
    referral.status === "REJECTED" ||
    referral.status === "REVERSED"
  ) {
    return false;
  }
  return now - toTime(readLastSyncedAt(referral.metadata)) >= syncCooldownMs;
}

/**
 * Reconciles a pending referral against the invitee's on-chain history.
 *
 * The in-app activity report only covers flows that call it, and can be lost
 * (tab closed, network error). This walks the invitee's USDC/EURC transfers
 * since sign-up and counts each outgoing payment once, verified from its
 * receipt the same way cashback is — so fees, self-transfers and savings
 * deposits never count, and a replayed hash is ignored.
 */
export async function syncReferralProgressFromChain(referral: ReferralRecord) {
  if (!needsReferralSync(referral)) return null;

  const wallet = referral.referred_wallet.toLowerCase();
  const since = toTime(referral.created_at);
  const [volumes, transfers] = await Promise.all([
    loadReferralVolumes([referral.id]),
    outgoingTransfersSince(wallet, since),
  ]);
  const counted = volumes.get(referral.id)?.hashes ?? new Set<string>();
  const sinceSignUp = transfers.filter((transfer) => toTime(transfer.timestamp) >= since);

  // Oldest first, so a backlog drains in order across syncs.
  const pending = [
    ...new Set(
      sinceSignUp
        .filter((transfer) => transfer.direction === "out")
        .reverse()
        .map((transfer) => transfer.hash.toLowerCase()),
    ),
  ]
    .filter((hash) => !counted.has(hash))
    .slice(0, maxVerificationsPerSync);

  const contributions: ReferralProgressContribution[] = [];
  for (const hash of pending) {
    const outflow = await verifyWalletOutflow(hash as Hash, wallet);
    if (!outflow) continue;
    contributions.push(await referralContribution(hash, outflow));
  }

  return evaluateReferralProgressAndQualify({
    referredWallet: wallet,
    contributions,
    source: "chain_sync",
    markSynced: true,
    metadata: { source: "chain_sync" },
  });
}
