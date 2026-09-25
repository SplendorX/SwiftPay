/**
 * Detect incoming stablecoin transfers via ArcScan and create in-app notifications.
 */
import {
  getArcScanHistoryUrls,
  normalizeArcScanTokenTransfers,
  type ArcScanTokenTransferResponse,
  type WalletTransfer,
} from "@/lib/arcscan-history";
import { findBatchTxHashes } from "@/lib/activity/service";
import { agentWalletOwners } from "@/lib/agent-wallet/config";
import { usernamesForWallets } from "@/lib/business/service";
import {
  copyPaymentReceived,
  createIncomingPaymentNotification,
} from "@/lib/save/notifications";

/**
 * Who sent each transfer. A payment ALLIE made comes from the sender's Agent
 * Wallet, which has no username of its own, so it is traced back to the
 * owner. Never fatal: without it the sender shows as an address.
 */
async function identifySenders(transfers: WalletTransfer[]) {
  const senders = transfers.map((t) => t.counterparty);
  const agentOwners = await agentWalletOwners(senders).catch(
    () => ({}) as Record<string, string>,
  );
  const usernames = await usernamesForWallets([
    ...senders,
    ...Object.values(agentOwners),
  ]).catch(() => ({}) as Record<string, string>);
  return { agentOwners, usernames };
}

const MAX_INCOMING_TO_SCAN = 25;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function shorten(address: string) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function fetchIncomingTransfers(ownerWallet: string) {
  const responses = await Promise.all(
    getArcScanHistoryUrls(ownerWallet).map((url) =>
      fetch(url, {
        cache: "no-store",
        headers: { accept: "application/json" },
      }),
    ),
  );

  if (responses.some((response) => !response.ok)) {
    return [] as WalletTransfer[];
  }

  const payload = (await Promise.all(
    responses.map((response) => response.json()),
  )) as ArcScanTokenTransferResponse[];

  // Incoming only — platform fee outflows are already excluded for history,
  // and fee-recipient inflows are real receives for that wallet.
  return normalizeArcScanTokenTransfers(ownerWallet, payload).filter(
    (transfer) => transfer.direction === "in",
  );
}

/**
 * Sync recent incoming payments into the notification feed.
 * Idempotent via related_tx_hash unique index.
 */
export async function syncIncomingPaymentNotifications(ownerWallet: string) {
  const wallet = ownerWallet.toLowerCase();
  let created = 0;
  let scanned = 0;

  try {
    const incoming = (await fetchIncomingTransfers(wallet)).slice(0, MAX_INCOMING_TO_SCAN);
    const now = Date.now();
    const [{ agentOwners, usernames }, batchHashes] = await Promise.all([
      identifySenders(incoming),
      findBatchTxHashes(incoming.map((t) => t.hash)).catch(() => new Set<string>()),
    ]);

    for (const transfer of incoming) {
      scanned += 1;

      if (transfer.timestamp) {
        const ts = Date.parse(transfer.timestamp);
        if (Number.isFinite(ts) && now - ts > MAX_AGE_MS) {
          continue;
        }
      }

      // Skip dust / zero
      const amountNum = Number(transfer.amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        continue;
      }

      const [whole, frac = ""] = transfer.amount.split(".");
      const amountDisplay = `${whole}.${(frac + "00").slice(0, 2)}`;
      // Name the sender: @username when they have a SwiftPay account, the
      // owner "via ALLIE" when their Agent Wallet paid, and "via BatchPay"
      // when the sender recorded this transaction as a batch.
      const agentOwner = agentOwners[transfer.counterparty.toLowerCase()];
      const senderWallet = agentOwner ?? transfer.counterparty.toLowerCase();
      const username = usernames[senderWallet];
      const sender = username ? `@${username}` : shorten(senderWallet);
      const viaBatch = batchHashes.has(transfer.hash.toLowerCase());
      const copy = copyPaymentReceived(
        amountDisplay,
        transfer.symbol,
        agentOwner
          ? `${sender} via ALLIE`
          : viaBatch
            ? `${sender} via BatchPay`
            : sender,
      );

      const row = await createIncomingPaymentNotification({
        ownerWallet: wallet,
        title: copy.title,
        body: copy.body,
        relatedTxHash: transfer.hash,
        metadata: {
          amount: amountDisplay,
          symbol: transfer.symbol,
          from: transfer.counterparty.toLowerCase(),
          fromUsername: username ?? null,
          viaAllie: Boolean(agentOwner),
          fromOwner: agentOwner ?? null,
          viaBatch,
          blockNumber: transfer.blockNumber,
          timestamp: transfer.timestamp,
        },
      });

      if (row) {
        created += 1;
      }
    }
  } catch (error) {
    console.warn(
      "[incoming-payments]",
      error instanceof Error ? error.message : "sync failed",
    );
  }

  return { scanned, created };
}
