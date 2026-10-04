/**
 * Incoming USDC/EURC transfers read straight from the Arc RPC.
 *
 * The explorer API answers server requests with a Cloudflare challenge on
 * mainnet, so anything that must work there reads Transfer events instead.
 *
 * USDC is Arc's native gas token. Every USDC movement, native or through the
 * ERC-20 interface, emits a Transfer event from the system address below with
 * an 18-decimal amount. An ERC-20 USDC transfer also emits a 6-decimal event
 * from the USDC contract, so reading only the system address counts each
 * payment once and still catches plain native sends.
 */
import {
  createPublicClient,
  formatUnits,
  http,
  parseAbiItem,
  type Address,
  type Hash,
} from "viem";

import type { WalletTransfer } from "@/lib/arcscan-history";
import { arcChain } from "@/lib/chains";
import { arcTokens, type ArcTokenSymbol } from "@/lib/tokens";

export const NATIVE_USDC_EVENT_ADDRESS =
  "0xfffffffffffffffffffffffffffffffffffffffe" as Address;
export const NATIVE_USDC_DECIMALS = 18;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

/** The Arc RPC rejects ranges of 10,000 blocks or more. */
const MAX_BLOCK_RANGE = 5_000n;
const MIN_BLOCK_RANGE = 100n;

type TransferSource = {
  decimals: number;
  symbol: ArcTokenSymbol;
};

/** Event emitter address (lowercase) → the token it reports. */
function transferSources() {
  const sources = new Map<string, TransferSource>([
    [
      NATIVE_USDC_EVENT_ADDRESS,
      { decimals: NATIVE_USDC_DECIMALS, symbol: "USDC" },
    ],
  ]);
  if (arcTokens.EURC.address !== ZERO_ADDRESS) {
    sources.set(arcTokens.EURC.address.toLowerCase(), {
      decimals: arcTokens.EURC.decimals,
      symbol: "EURC",
    });
  }
  return sources;
}

/**
 * The public Arc RPC allows only a few requests a second, shared by every
 * user behind the server's IPs. ARC_SERVER_RPC_URL points server reads at a
 * dedicated endpoint instead.
 */
export function createArcRpcClient() {
  const url =
    process.env.ARC_SERVER_RPC_URL?.trim() || arcChain.rpcUrls.default.http[0];
  return createPublicClient({
    chain: arcChain,
    // Rate-limit (429) answers are retried with backoff.
    transport: http(url, { retryCount: 4, retryDelay: 500 }),
  });
}

type ArcRpcClient = ReturnType<typeof createArcRpcClient>;

function isRangeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /exceeded max allowed range|max results|range too large/i.test(message);
}

function getTransferLogs(
  client: ArcRpcClient,
  addresses: Address[],
  to: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  return client.getLogs({
    address: addresses,
    args: { to },
    event: transferEvent,
    fromBlock,
    toBlock,
  });
}

async function transferLogs(
  client: ArcRpcClient,
  addresses: Address[],
  to: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Awaited<ReturnType<typeof getTransferLogs>>> {
  try {
    return await getTransferLogs(client, addresses, to, fromBlock, toBlock);
  } catch (error) {
    // Split the range when the RPC says it is too wide or returns too much.
    const span = toBlock - fromBlock + 1n;
    if (!isRangeError(error) || span <= MIN_BLOCK_RANGE) {
      throw error;
    }
    const middle = fromBlock + span / 2n;
    const first = await transferLogs(client, addresses, to, fromBlock, middle - 1n);
    const second = await transferLogs(client, addresses, to, middle, toBlock);
    return [...first, ...second];
  }
}

/**
 * USDC/EURC received by `wallet` between two blocks (inclusive), newest
 * first. Queries run one at a time to stay under the RPC's rate limit. Throws
 * if any part of the range could not be read, so a caller that keeps a cursor
 * never skips blocks.
 */
export async function fetchIncomingTransfersFromRpc(
  wallet: string,
  range: { fromBlock: bigint; toBlock: bigint },
  client: ArcRpcClient = createArcRpcClient(),
): Promise<WalletTransfer[]> {
  const to = wallet.toLowerCase() as Address;
  const sources = transferSources();
  const addresses = [...sources.keys()] as Address[];
  const transfers: WalletTransfer[] = [];

  for (
    let start = range.fromBlock;
    start <= range.toBlock;
    start += MAX_BLOCK_RANGE
  ) {
    const end =
      start + MAX_BLOCK_RANGE - 1n < range.toBlock
        ? start + MAX_BLOCK_RANGE - 1n
        : range.toBlock;
    const logs = await transferLogs(client, addresses, to, start, end);
    for (const log of logs) {
      const source = sources.get(log.address.toLowerCase());
      const from = log.args.from;
      const value = log.args.value;
      if (!source || !from || value == null || !log.transactionHash) {
        continue;
      }
      transfers.push({
        amount: formatUnits(value, source.decimals),
        blockNumber: Number(log.blockNumber ?? 0n),
        counterparty: from,
        counterpartyIsContract: false,
        direction: "in",
        hash: log.transactionHash as Hash,
        logIndex: log.logIndex ?? 0,
        method: null,
        symbol: source.symbol,
        timestamp: null,
      });
    }
  }

  return transfers.sort((left, right) =>
    left.blockNumber === right.blockNumber
      ? right.logIndex - left.logIndex
      : right.blockNumber - left.blockNumber,
  );
}

/** Fill in each transfer's block time. Best-effort: misses stay null. */
export async function withBlockTimestamps(
  transfers: WalletTransfer[],
  client: ArcRpcClient = createArcRpcClient(),
) {
  const blocks = [...new Set(transfers.map((t) => t.blockNumber))];
  const times = new Map<number, string>();
  await Promise.all(
    blocks.map(async (blockNumber) => {
      try {
        const block = await client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        times.set(
          blockNumber,
          new Date(Number(block.timestamp) * 1000).toISOString(),
        );
      } catch {
        // Leave the timestamp empty.
      }
    }),
  );
  return transfers.map((transfer) => ({
    ...transfer,
    timestamp: times.get(transfer.blockNumber) ?? transfer.timestamp,
  }));
}
