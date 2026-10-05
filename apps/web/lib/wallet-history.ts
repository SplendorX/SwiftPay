// Server-only. A wallet's USDC/EURC history from the Arc RPC, kept in
// wallet_transfer_history so a page load only reads what is new (see
// packages/database/supabase/wallet-transfer-history.sql).
import type { Address, Hash } from "viem";

import {
  createArcRpcClient,
  fetchWalletTransfersFromRpc,
  withBlockTimestamps,
} from "@/lib/arc-transfers";
import { getPlatformFeeRecipientAddresses, type WalletTransfer } from "@/lib/arcscan-history";
import { arcChain } from "@/lib/chains";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import type { ArcTokenSymbol } from "@/lib/tokens";

const historyTable = "wallet_transfer_history";
const cursorTable = "wallet_history_cursors";

// Arc makes a block about every half second.
/** How far back a wallet's history is filled: about 90 days (Transaction History's window). */
const HISTORY_DEPTH_BLOCKS = 15_552_000n;
/** The first read covers about 3 hours, so recent activity shows at once. */
const FIRST_READ_BLOCKS = 21_600n;
/** Most new blocks one load reads (~6 hours); a longer gap catches up over loads. */
const MAX_FORWARD_BLOCKS = 43_200n;
/**
 * How much older history one load fills. Each 5,000 blocks costs two RPC
 * queries (in and out), so the default stays gentle on the shared public RPC;
 * raise it with a dedicated ARC_SERVER_RPC_URL.
 */
const BACKFILL_BLOCKS =
  BigInt(Math.max(1, Number(process.env.ARC_HISTORY_BACKFILL_CHUNKS ?? "6") || 6)) * 5_000n;
/** Skip a wallet read this recently (another tab, the overview). */
const MIN_SYNC_INTERVAL_MS = 15_000;
/** Rows returned, newest first, like the explorer's list. */
const HISTORY_LIMIT = 100;

type Cursor = { newestBlock: bigint; oldestBlock: bigint; floorBlock: bigint; updatedAt: number };

type HistoryRow = {
  tx_hash: string;
  log_index: number;
  direction: "in" | "out";
  counterparty: string;
  symbol: ArcTokenSymbol;
  amount: string;
  block_number: number | string;
  occurred_at: string | null;
};

function db() {
  return createSupabaseAdminClient();
}

async function readCursor(wallet: string): Promise<Cursor | null> {
  const { data, error } = await db()
    .from(cursorTable)
    .select("newest_block, oldest_block, floor_block, updated_at")
    .eq("chain_id", arcChain.id)
    .eq("wallet_address", wallet)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    floorBlock: BigInt(data.floor_block),
    newestBlock: BigInt(data.newest_block),
    oldestBlock: BigInt(data.oldest_block),
    updatedAt: Date.parse(data.updated_at),
  };
}

async function writeCursor(wallet: string, cursor: Omit<Cursor, "updatedAt">) {
  const { error } = await db()
    .from(cursorTable)
    .upsert(
      {
        chain_id: arcChain.id,
        floor_block: cursor.floorBlock.toString(),
        newest_block: cursor.newestBlock.toString(),
        oldest_block: cursor.oldestBlock.toString(),
        updated_at: new Date().toISOString(),
        wallet_address: wallet,
      },
      { onConflict: "chain_id,wallet_address" },
    );
  if (error) throw error;
}

async function storeTransfers(wallet: string, transfers: WalletTransfer[]) {
  if (transfers.length === 0) return;
  const timed = await withBlockTimestamps(transfers);
  const { error } = await db()
    .from(historyTable)
    .upsert(
      timed.map((transfer) => ({
        amount: transfer.amount,
        block_number: transfer.blockNumber,
        chain_id: arcChain.id,
        counterparty: transfer.counterparty.toLowerCase(),
        direction: transfer.direction,
        log_index: transfer.logIndex,
        occurred_at: transfer.timestamp,
        symbol: transfer.symbol,
        tx_hash: transfer.hash.toLowerCase(),
        wallet_address: wallet,
      })),
      { ignoreDuplicates: true, onConflict: "chain_id,wallet_address,tx_hash,log_index,direction" },
    );
  if (error) throw error;
}

async function readRange(
  wallet: string,
  range: { fromBlock: bigint; toBlock: bigint },
  client: ReturnType<typeof createArcRpcClient>,
) {
  // One direction at a time keeps the request rate down.
  const incoming = await fetchWalletTransfersFromRpc(wallet, range, "in", client);
  const outgoing = await fetchWalletTransfersFromRpc(wallet, range, "out", client);
  return [...incoming, ...outgoing];
}

/**
 * Reads what is new since the last load and fills a little more of the past.
 * The cursor only moves once the blocks it covers are stored, so a failed
 * read is retried next time rather than skipped.
 */
export async function syncWalletHistory(walletInput: string) {
  const wallet = walletInput.toLowerCase();
  const cursor = await readCursor(wallet);
  if (cursor && Date.now() - cursor.updatedAt < MIN_SYNC_INTERVAL_MS) return;

  const client = createArcRpcClient();
  const head = await client.getBlockNumber();

  let next: Omit<Cursor, "updatedAt">;
  if (!cursor) {
    const fromBlock = head > FIRST_READ_BLOCKS ? head - FIRST_READ_BLOCKS : 0n;
    await storeTransfers(wallet, await readRange(wallet, { fromBlock, toBlock: head }, client));
    next = {
      floorBlock: head > HISTORY_DEPTH_BLOCKS ? head - HISTORY_DEPTH_BLOCKS : 0n,
      newestBlock: head,
      oldestBlock: fromBlock,
    };
  } else {
    next = { ...cursor };
    // Wallets first read with a shallower depth keep filling to the current one.
    const floor = head > HISTORY_DEPTH_BLOCKS ? head - HISTORY_DEPTH_BLOCKS : 0n;
    if (floor < cursor.floorBlock) next.floorBlock = floor;
    // Forward: everything new, up to the per-load cap.
    if (cursor.newestBlock < head) {
      const fromBlock = cursor.newestBlock + 1n;
      const toBlock = head - fromBlock + 1n > MAX_FORWARD_BLOCKS ? fromBlock + MAX_FORWARD_BLOCKS - 1n : head;
      await storeTransfers(wallet, await readRange(wallet, { fromBlock, toBlock }, client));
      next.newestBlock = toBlock;
    }
    // Backward: one more slice of the past, down to the floor.
    if (cursor.oldestBlock > next.floorBlock) {
      const toBlock = cursor.oldestBlock - 1n;
      const fromBlock =
        toBlock - next.floorBlock + 1n > BACKFILL_BLOCKS ? toBlock - BACKFILL_BLOCKS + 1n : next.floorBlock;
      await storeTransfers(wallet, await readRange(wallet, { fromBlock, toBlock }, client));
      next.oldestBlock = fromBlock;
    }
  }
  await writeCursor(wallet, next);
}

/** Known SwiftPay contracts, labelled "App action" on receipts like the explorer did. */
function platformContracts() {
  return new Set(
    [
      process.env.NEXT_PUBLIC_SWIFTPAY_SEND_ADDRESS,
      process.env.NEXT_PUBLIC_SWIFTBATCH_ADDRESS,
      process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS,
    ]
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
}

/**
 * The stored history, newest first, in the explorer's shape. By default the
 * newest 100 with platform fee legs hidden (what Activity shows); a statement
 * asks for a date range, and referral progress for every outflow.
 */
export async function readWalletHistory(
  walletInput: string,
  options: {
    from?: Date;
    to?: Date;
    direction?: "in" | "out";
    includePlatformFees?: boolean;
    limit?: number;
  } = {},
): Promise<WalletTransfer[]> {
  const wallet = walletInput.toLowerCase();
  const limit = options.limit ?? HISTORY_LIMIT;
  let query = db()
    .from(historyTable)
    .select("tx_hash, log_index, direction, counterparty, symbol, amount, block_number, occurred_at")
    .eq("chain_id", arcChain.id)
    .eq("wallet_address", wallet)
    .order("block_number", { ascending: false })
    .order("log_index", { ascending: false })
    .limit(limit + 20);
  if (options.from) query = query.gte("occurred_at", options.from.toISOString());
  if (options.to) query = query.lte("occurred_at", options.to.toISOString());
  if (options.direction) query = query.eq("direction", options.direction);
  const { data, error } = await query;
  if (error) throw error;

  const feeRecipients = new Set(options.includePlatformFees ? [] : getPlatformFeeRecipientAddresses());
  const contracts = platformContracts();
  return ((data ?? []) as HistoryRow[])
    // Platform fee legs are hidden from end-user history, as before.
    .filter((row) => !(row.direction === "out" && feeRecipients.has(row.counterparty)))
    .slice(0, limit)
    .map((row) => ({
      amount: row.amount,
      blockNumber: Number(row.block_number),
      counterparty: row.counterparty as Address,
      counterpartyIsContract: contracts.has(row.counterparty),
      direction: row.direction,
      hash: row.tx_hash as Hash,
      logIndex: row.log_index,
      method: null,
      symbol: row.symbol,
      timestamp: row.occurred_at,
    }));
}

/**
 * From when the stored history is complete: the time of the oldest block
 * read so far. Null before the first read. Statements say so when their range
 * starts earlier, since only SwiftPay's own records reach back further.
 */
export async function walletHistoryCoverage(walletInput: string) {
  const cursor = await readCursor(walletInput.toLowerCase()).catch(() => null);
  if (!cursor) return null;
  try {
    const block = await createArcRpcClient().getBlock({ blockNumber: cursor.oldestBlock });
    return new Date(Number(block.timestamp) * 1000).toISOString();
  } catch {
    return null;
  }
}

/**
 * A wallet's history from the RPC store: brought up to date first, then read.
 * If the sync fails (RPC busy), whatever is stored is still returned.
 */
export async function walletHistoryFromRpc(
  wallet: string,
  options?: Parameters<typeof readWalletHistory>[1],
) {
  try {
    await syncWalletHistory(wallet);
  } catch (error) {
    console.warn("[wallet-history] sync failed", wallet, error instanceof Error ? error.message : error);
  }
  return readWalletHistory(wallet, options);
}
