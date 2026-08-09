import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  pad,
  parseAbiItem,
  toEventHash,
  type Address,
  type Hash,
  type Hex,
} from "viem";

import { earnConfig } from "@/lib/earn/config";
import { arcTestnetTokens } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

const depositEvent = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);
const withdrawEvent = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);

const DEPOSIT_TOPIC = toEventHash(depositEvent);
const WITHDRAW_TOPIC = toEventHash(withdrawEvent);

const USDC_DECIMALS = arcTestnetTokens.USDC.decimals;
const ARCSCAN_API = "https://testnet.arcscan.app/api";
/** Single RPC fallback window — one request, avoids rate limits. */
const RPC_FALLBACK_BLOCKS = 1_500n;
const MAX_RESULTS = 50;

export type EarnTxType = "deposit" | "withdraw";

export type EarnTransaction = {
  id: string;
  type: EarnTxType;
  assets: string;
  assetsRaw: string;
  shares: string;
  hash: Hash;
  blockNumber: number;
  logIndex: number;
  timestamp: string | null;
  status: "confirmed" | "pending";
  source: "onchain" | "session" | "explorer";
};

function formatAssets(value: bigint): string {
  const n = Number(formatUnits(value, USDC_DECIMALS));
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function ownerTopic(owner: Address): Hex {
  return pad(owner, { size: 32 });
}

function sanitizeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit")) {
    return "Network is busy (RPC rate limit). Showing available activity — try refresh in a moment.";
  }
  if (lower.includes("range too large")) {
    return "Could not scan full history on public RPC. Showing recent activity only.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Could not reach Arc network. Check connection and try again.";
  }
  // Never dump full RPC request bodies into the UI
  if (message.length > 160 || message.includes("Request body")) {
    return "Could not load full transaction history. Recent activity may still appear below.";
  }
  return message;
}

type ArcScanLogRow = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  timeStamp?: string;
  transactionHash?: string;
  logIndex?: string;
  gasPrice?: string;
  gasUsed?: string;
};

function parseHexInt(value?: string): number {
  if (!value) return 0;
  try {
    return Number(BigInt(value));
  } catch {
    return 0;
  }
}

function logToTransaction(
  row: ArcScanLogRow,
  type: EarnTxType,
): EarnTransaction | null {
  if (!row.transactionHash || !row.data || !row.topics?.length) {
    return null;
  }

  try {
    const decoded = decodeEventLog({
      abi: [type === "deposit" ? depositEvent : withdrawEvent],
      data: row.data as Hex,
      topics: row.topics as [Hex, ...Hex[]],
    });

    const args = decoded.args as {
      assets?: bigint;
      shares?: bigint;
    };

    if (args.assets === undefined || args.shares === undefined) {
      return null;
    }

    const blockNumber = parseHexInt(row.blockNumber);
    const logIndex = parseHexInt(row.logIndex);
    const ts = parseHexInt(row.timeStamp);
    const timestamp =
      ts > 0 ? new Date(ts * 1000).toISOString() : null;

    return {
      id: `${row.transactionHash}-${logIndex}`,
      type,
      assets: formatAssets(args.assets),
      assetsRaw: args.assets.toString(),
      shares: args.shares.toString(),
      hash: row.transactionHash as Hash,
      blockNumber,
      logIndex,
      timestamp,
      status: "confirmed",
      source: "explorer",
    };
  } catch {
    return null;
  }
}

/**
 * Prefer ArcScan (Blockscout) logs API — no eth_getLogs range/rate issues.
 * Deposit: topic0 = Deposit, topic2 = owner (indexed).
 * Withdraw: topic0 = Withdraw, topic3 = owner (indexed).
 */
async function fetchFromArcScan(
  vault: Address,
  owner: Address,
): Promise<EarnTransaction[]> {
  const ownerPad = ownerTopic(owner);
  const common = `address=${vault}&fromBlock=0&toBlock=latest`;

  const depositUrl = `${ARCSCAN_API}?module=logs&action=getLogs&${common}&topic0=${DEPOSIT_TOPIC}&topic2=${ownerPad}&topic0_2_opr=and`;
  const withdrawUrl = `${ARCSCAN_API}?module=logs&action=getLogs&${common}&topic0=${WITHDRAW_TOPIC}&topic3=${ownerPad}&topic0_3_opr=and`;

  const [depositRes, withdrawRes] = await Promise.all([
    fetch(depositUrl, { cache: "no-store" }),
    fetch(withdrawUrl, { cache: "no-store" }),
  ]);

  const depositJson = (await depositRes.json()) as {
    status?: string;
    message?: string;
    result?: ArcScanLogRow[] | string;
  };
  const withdrawJson = (await withdrawRes.json()) as {
    status?: string;
    message?: string;
    result?: ArcScanLogRow[] | string;
  };

  const depositRows = Array.isArray(depositJson.result)
    ? depositJson.result
    : [];
  const withdrawRows = Array.isArray(withdrawJson.result)
    ? withdrawJson.result
    : [];

  // If both failed with error strings, throw for fallback
  if (
    !Array.isArray(depositJson.result) &&
    !Array.isArray(withdrawJson.result) &&
    depositRows.length === 0 &&
    withdrawRows.length === 0
  ) {
    const msg =
      typeof depositJson.result === "string"
        ? depositJson.result
        : depositJson.message || "ArcScan logs unavailable";
    if (msg.toLowerCase() !== "no records found") {
      throw new Error(msg);
    }
  }

  const txs: EarnTransaction[] = [];
  for (const row of depositRows) {
    const tx = logToTransaction(row, "deposit");
    if (tx) txs.push(tx);
  }
  for (const row of withdrawRows) {
    const tx = logToTransaction(row, "withdraw");
    if (tx) txs.push(tx);
  }

  return txs;
}

/**
 * Last-resort: one small eth_getLogs window only (avoids multi-chunk rate limits).
 */
async function fetchFromRpcFallback(
  vault: Address,
  owner: Address,
): Promise<EarnTransaction[]> {
  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0], {
      timeout: 20_000,
      retryCount: 0,
    }),
  });

  const latest = await client.getBlockNumber();
  const fromBlock =
    latest > RPC_FALLBACK_BLOCKS ? latest - RPC_FALLBACK_BLOCKS : 0n;

  const [depositLogs, withdrawLogs] = await Promise.all([
    client.getLogs({
      address: vault,
      event: depositEvent,
      args: { owner },
      fromBlock,
      toBlock: latest,
    }),
    client.getLogs({
      address: vault,
      event: withdrawEvent,
      args: { owner },
      fromBlock,
      toBlock: latest,
    }),
  ]);

  const mapped: EarnTransaction[] = [];

  for (const log of depositLogs) {
    const args = log.args as { assets?: bigint; shares?: bigint };
    if (
      args.assets === undefined ||
      args.shares === undefined ||
      !log.transactionHash
    ) {
      continue;
    }
    mapped.push({
      id: `${log.transactionHash}-${log.logIndex ?? 0}`,
      type: "deposit",
      assets: formatAssets(args.assets),
      assetsRaw: args.assets.toString(),
      shares: args.shares.toString(),
      hash: log.transactionHash,
      blockNumber: log.blockNumber ? Number(log.blockNumber) : 0,
      logIndex: log.logIndex ?? 0,
      timestamp: null,
      status: "confirmed",
      source: "onchain",
    });
  }

  for (const log of withdrawLogs) {
    const args = log.args as { assets?: bigint; shares?: bigint };
    if (
      args.assets === undefined ||
      args.shares === undefined ||
      !log.transactionHash
    ) {
      continue;
    }
    mapped.push({
      id: `${log.transactionHash}-${log.logIndex ?? 0}`,
      type: "withdraw",
      assets: formatAssets(args.assets),
      assetsRaw: args.assets.toString(),
      shares: args.shares.toString(),
      hash: log.transactionHash,
      blockNumber: log.blockNumber ? Number(log.blockNumber) : 0,
      logIndex: log.logIndex ?? 0,
      timestamp: null,
      status: "confirmed",
      source: "onchain",
    });
  }

  return mapped;
}

function sortAndCap(txs: EarnTransaction[]): EarnTransaction[] {
  return [...txs]
    .sort((a, b) => {
      if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
      return b.logIndex - a.logIndex;
    })
    .slice(0, MAX_RESULTS);
}

/**
 * Load user Earn vault deposits/withdrawals.
 * 1) ArcScan logs API (preferred)
 * 2) Single small RPC window (fallback)
 * Never floods public RPC with chunked getLogs (rate limits).
 */
export async function fetchEarnTransactions(options: {
  owner: Address;
  vault?: Address | null;
}): Promise<{
  transactions: EarnTransaction[];
  error?: string;
  source?: "explorer" | "rpc" | "none";
}> {
  const vault = options.vault ?? earnConfig.vaultAddress;
  if (!vault) {
    return {
      transactions: [],
      error: "Earn vault is not configured.",
      source: "none",
    };
  }

  const owner = options.owner;
  let softError: string | undefined;

  // 1) Explorer
  try {
    const fromExplorer = await fetchFromArcScan(vault, owner);
    if (fromExplorer.length > 0) {
      return {
        transactions: sortAndCap(fromExplorer),
        source: "explorer",
      };
    }
    // Empty is valid (no history yet) — still success via explorer
    return {
      transactions: [],
      source: "explorer",
    };
  } catch (error) {
    softError = sanitizeError(
      error instanceof Error ? error.message : "Explorer unavailable",
    );
  }

  // 2) Single RPC window only
  try {
    const fromRpc = await fetchFromRpcFallback(vault, owner);
    return {
      transactions: sortAndCap(fromRpc),
      error: fromRpc.length === 0 ? softError : undefined,
      source: "rpc",
    };
  } catch (error) {
    const rpcError = sanitizeError(
      error instanceof Error ? error.message : "RPC unavailable",
    );
    return {
      transactions: [],
      error: softError || rpcError,
      source: "none",
    };
  }
}
