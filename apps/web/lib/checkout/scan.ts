// Server-only. Reads a merchant's incoming transfers from the Arc RPC and
// claims the ones that pay a card/bank or bridge charge (see match.ts).
import { accountDb, accountTables, readAccountDbError } from "@/lib/account/db";
import { createArcRpcClient, fetchIncomingTransfersFromRpc } from "@/lib/arc-transfers";
import { arcChain } from "@/lib/chains";
import { isBusinessHttpError } from "@/lib/business/errors";
import { MATCH_GRACE_BLOCKS, selectMatches } from "@/lib/checkout/match";
import { claimTransferForCharge } from "@/lib/checkout/settlement";
import type { ChargeRecord } from "@/lib/checkout/types";

/** Skip a merchant scanned this recently (another tab, the payer's page). */
const MIN_SCAN_INTERVAL_MS = 15_000;
/** Most blocks one scan reads (~6 hours); a longer gap catches up over runs. */
const MAX_SCAN_BLOCKS = 43_200n;
/** How long a card/bank or bridge intent stays matchable, even once expired. */
const MATCHABLE_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export type ScanResult = {
  scanned: boolean;
  claimed: number;
  reason?: "throttled" | "nothing-to-match" | "caught-up";
};

/** Charges of this merchant waiting on a hash-less payment. */
export async function loadMatchableCharges(wallet: string) {
  const { data, error } = await accountDb()
    .from(accountTables.charges)
    .select("*")
    .eq("wallet_address", wallet.toLowerCase())
    .in("status", ["OPEN", "EXPIRED"])
    .in("pending_method", ["ONRAMP", "BRIDGE"])
    .gte("pending_started_at", new Date(Date.now() - MATCHABLE_FOR_MS).toISOString());
  if (error) throw new Error(readAccountDbError(error, "Could not load charges to match."));
  return (data ?? []) as ChargeRecord[];
}

async function readCursor(wallet: string) {
  const { data, error } = await accountDb()
    .from(accountTables.checkoutCursors)
    .select("last_block, updated_at")
    .eq("chain_id", arcChain.id)
    .eq("wallet_address", wallet)
    .maybeSingle();
  if (error) throw new Error(readAccountDbError(error, "Could not read the scan cursor."));
  return data?.last_block != null
    ? { lastBlock: BigInt(data.last_block), updatedAt: Date.parse(data.updated_at) }
    : null;
}

async function writeCursor(wallet: string, block: bigint) {
  const { error } = await accountDb()
    .from(accountTables.checkoutCursors)
    .upsert(
      {
        chain_id: arcChain.id,
        last_block: block.toString(),
        updated_at: new Date().toISOString(),
        wallet_address: wallet,
      },
      { onConflict: "chain_id,wallet_address" },
    );
  if (error) throw new Error(readAccountDbError(error, "Could not save the scan cursor."));
}

/** Hashes already credited to a charge or an invoice. */
async function claimedAmong(hashes: string[]) {
  if (hashes.length === 0) return new Set<string>();
  const supabase = accountDb();
  const [charges, invoices] = await Promise.all([
    supabase.from(accountTables.chargePayments).select("tx_hash").in("tx_hash", hashes),
    supabase.from(accountTables.invoicePayments).select("tx_hash").in("tx_hash", hashes),
  ]);
  if (charges.error) throw new Error(readAccountDbError(charges.error, "Could not check payments."));
  if (invoices.error) throw new Error(readAccountDbError(invoices.error, "Could not check payments."));
  return new Set(
    [...(charges.data ?? []), ...(invoices.data ?? [])].map((row) =>
      (row as { tx_hash: string }).tx_hash.toLowerCase(),
    ),
  );
}

/** Wallets paying this merchant's charges directly; their sends confirm by receipt. */
async function directPayers(wallet: string) {
  const { data, error } = await accountDb()
    .from(accountTables.charges)
    .select("payer_wallet")
    .eq("wallet_address", wallet)
    .eq("status", "OPEN")
    .in("pending_method", ["WALLET", "SWIFTPAY"])
    .not("payer_wallet", "is", null);
  if (error) throw new Error(readAccountDbError(error, "Could not load charges."));
  return new Set(
    (data ?? []).map((row) => String((row as { payer_wallet: string }).payer_wallet).toLowerCase()),
  );
}

/**
 * Claims incoming transfers for this merchant's card/bank and bridge charges.
 * Throttled per merchant; does nothing (and reads no RPC) when no charge is
 * waiting. The cursor only advances to head − grace, and only after every
 * claim succeeded, so no transfer is skipped.
 */
export async function syncChargeMatches(
  walletInput: string,
  options?: { force?: boolean },
): Promise<ScanResult> {
  const wallet = walletInput.toLowerCase();
  const charges = await loadMatchableCharges(wallet);
  if (charges.length === 0) return { claimed: 0, reason: "nothing-to-match", scanned: false };

  const cursor = await readCursor(wallet);
  if (!options?.force && cursor && Date.now() - cursor.updatedAt < MIN_SCAN_INTERVAL_MS) {
    return { claimed: 0, reason: "throttled", scanned: false };
  }

  const createdBlocks = charges
    .map((charge) => charge.created_block)
    .filter((block): block is number | string => block !== null)
    .map((block) => BigInt(block));
  if (createdBlocks.length === 0) return { claimed: 0, reason: "nothing-to-match", scanned: false };
  const earliestCharge = createdBlocks.reduce((min, block) => (block < min ? block : min));

  const client = createArcRpcClient();
  const head = await client.getBlockNumber();
  const settledHead = head - BigInt(MATCH_GRACE_BLOCKS);
  let fromBlock = cursor ? cursor.lastBlock + 1n : earliestCharge;
  if (fromBlock < earliestCharge) fromBlock = earliestCharge;
  if (fromBlock > settledHead) {
    // Nothing new is old enough yet; still counts as a scan for the throttle.
    if (cursor) await writeCursor(wallet, cursor.lastBlock);
    return { claimed: 0, reason: "caught-up", scanned: false };
  }
  const toBlock =
    settledHead - fromBlock + 1n > MAX_SCAN_BLOCKS ? fromBlock + MAX_SCAN_BLOCKS - 1n : settledHead;

  const transfers = await fetchIncomingTransfersFromRpc(wallet, { fromBlock, toBlock }, client);
  const [claimedHashes, excludedSenders] = await Promise.all([
    claimedAmong([...new Set(transfers.map((transfer) => transfer.hash.toLowerCase()))]),
    directPayers(wallet),
  ]);

  const matches = selectMatches({
    charges,
    claimedHashes,
    excludedSenders,
    headBlock: Number(head),
    transfers: transfers.map((transfer) => ({
      amount: transfer.amount,
      blockNumber: transfer.blockNumber,
      from: transfer.counterparty,
      hash: transfer.hash,
      symbol: transfer.symbol,
    })),
  });

  const byId = new Map(charges.map((charge) => [charge.id, charge]));
  let claimed = 0;
  for (const match of matches) {
    const charge = byId.get(match.chargeId);
    if (!charge) continue;
    try {
      const result = await claimTransferForCharge({
        amount: Number(match.transfer.amount),
        blockNumber: match.transfer.blockNumber,
        charge,
        from: match.transfer.from,
        matchedBy: "SCAN",
        source: charge.pending_method === "BRIDGE" ? "BRIDGE" : "ONRAMP",
        txHash: match.transfer.hash,
      });
      if (result.claimed) claimed += 1;
    } catch (error) {
      // Claimed by another path in the meantime, or the charge was cancelled:
      // that transfer is settled elsewhere. Anything else stops the scan
      // before the cursor moves, so the range is read again next time.
      if (!isBusinessHttpError(error)) throw error;
    }
  }

  await writeCursor(wallet, toBlock);
  return { claimed, scanned: true };
}

/** Runs the scan for a charge the caller is looking at; never fails the read. */
export async function syncChargeMatchesFor(charge: ChargeRecord) {
  if (charge.status !== "OPEN" && charge.status !== "EXPIRED") return false;
  if (charge.pending_method !== "ONRAMP" && charge.pending_method !== "BRIDGE") return false;
  try {
    const result = await syncChargeMatches(charge.wallet_address);
    return result.claimed > 0;
  } catch (error) {
    console.warn("[checkout] charge scan failed", error);
    return false;
  }
}
