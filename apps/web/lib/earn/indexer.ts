import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Hash,
  type Log,
} from "viem";

import { earnConfig } from "@/lib/earn/config";
import { formatUnitsToDecimal } from "@/lib/earn/decimal";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { arcTestnet } from "@/lib/wagmi";
import { arcTestnetTokens } from "@/lib/tokens";

const depositEvent = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);
const withdrawEvent = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);
const feeEvent = parseAbiItem(
  "event PerformanceFeeCollected(uint256 grossYield, uint256 fee, uint256 timestamp)",
);

const depositsTable = process.env.SUPABASE_EARN_DEPOSITS_TABLE ?? "earn_deposits";
const withdrawalsTable =
  process.env.SUPABASE_EARN_WITHDRAWALS_TABLE ?? "earn_withdrawals";
const feeTable = process.env.SUPABASE_EARN_FEE_EVENTS_TABLE ?? "earn_fee_events";
const cursorTable =
  process.env.SUPABASE_EARN_INDEX_CURSORS_TABLE ?? "earn_index_cursors";

const USDC_DECIMALS = arcTestnetTokens.USDC.decimals;
const CHAIN_ID = arcTestnet.id;

export type IndexResult = {
  fromBlock: bigint;
  toBlock: bigint;
  depositsIndexed: number;
  withdrawalsIndexed: number;
  feesIndexed: number;
  errors: string[];
  status: "ok" | "skipped" | "error";
  message?: string;
};

function createClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(arcTestnet.rpcUrls.default.http[0]),
  });
}

async function getCursor(vault: string): Promise<bigint> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from(cursorTable)
      .select("last_block")
      .eq("chain_id", CHAIN_ID)
      .eq("vault_address", vault.toLowerCase())
      .maybeSingle();

    if (data?.last_block != null) {
      return BigInt(data.last_block);
    }
  } catch {
    // table may not exist yet
  }
  return 0n;
}

async function setCursor(vault: string, block: bigint) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from(cursorTable).upsert(
      {
        chain_id: CHAIN_ID,
        vault_address: vault.toLowerCase(),
        last_block: block.toString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chain_id,vault_address" },
    );
  } catch {
    // non-fatal
  }
}

function logMeta(log: Log) {
  return {
    tx_hash: log.transactionHash as Hash,
    block_number: log.blockNumber ? Number(log.blockNumber) : null,
    log_index: log.logIndex ?? null,
  };
}

/**
 * Index vault Deposit / Withdraw / PerformanceFeeCollected events.
 * Backend is analytics only — never overrides on-chain balances.
 */
export async function indexEarnVaultEvents(options?: {
  fromBlock?: bigint;
  maxBlocks?: number;
}): Promise<IndexResult> {
  const vault = earnConfig.vaultAddress;
  const errors: string[] = [];

  if (!vault) {
    return {
      fromBlock: 0n,
      toBlock: 0n,
      depositsIndexed: 0,
      withdrawalsIndexed: 0,
      feesIndexed: 0,
      errors: [],
      status: "skipped",
      message: "Vault address not configured.",
    };
  }

  const client = createClient();
  const latest = await client.getBlockNumber();
  const maxBlocks = BigInt(options?.maxBlocks ?? 5_000);
  const cursor = options?.fromBlock ?? (await getCursor(vault.toLowerCase()));
  const fromBlock = cursor > 0n ? cursor + 1n : 0n;
  let toBlock = latest;

  if (fromBlock > latest) {
    return {
      fromBlock,
      toBlock: latest,
      depositsIndexed: 0,
      withdrawalsIndexed: 0,
      feesIndexed: 0,
      errors: [],
      status: "ok",
      message: "Already up to date.",
    };
  }

  if (toBlock - fromBlock > maxBlocks) {
    toBlock = fromBlock + maxBlocks;
  }

  let depositsIndexed = 0;
  let withdrawalsIndexed = 0;
  let feesIndexed = 0;

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return {
      fromBlock,
      toBlock,
      depositsIndexed: 0,
      withdrawalsIndexed: 0,
      feesIndexed: 0,
      errors: [
        error instanceof Error ? error.message : "Supabase unavailable.",
      ],
      status: "error",
      message: "Indexer requires Supabase service role.",
    };
  }

  try {
    const depositLogs = await client.getLogs({
      address: vault as Address,
      event: depositEvent,
      fromBlock,
      toBlock,
    });

    for (const log of depositLogs) {
      const args = log.args as {
        sender?: Address;
        owner?: Address;
        assets?: bigint;
        shares?: bigint;
      };
      if (!args.owner || args.assets === undefined || args.shares === undefined) {
        continue;
      }

      const meta = logMeta(log);
      const row = {
        chain_id: CHAIN_ID,
        vault_address: vault.toLowerCase(),
        wallet_address: args.owner.toLowerCase(),
        assets: formatUnitsToDecimal(args.assets, USDC_DECIMALS),
        shares: args.shares.toString(),
        tx_hash: meta.tx_hash,
        block_number: meta.block_number,
        log_index: meta.log_index,
        timestamp: null as string | null,
      };

      if (log.blockNumber) {
        try {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          row.timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
        } catch {
          // optional
        }
      }

      const { error } = await supabase.from(depositsTable).upsert(row, {
        onConflict: "chain_id,tx_hash,log_index",
        ignoreDuplicates: true,
      });

      if (error) {
        errors.push(`deposit ${meta.tx_hash}: ${error.message}`);
      } else {
        depositsIndexed += 1;
      }
    }

    const withdrawLogs = await client.getLogs({
      address: vault as Address,
      event: withdrawEvent,
      fromBlock,
      toBlock,
    });

    for (const log of withdrawLogs) {
      const args = log.args as {
        owner?: Address;
        assets?: bigint;
        shares?: bigint;
      };
      if (!args.owner || args.assets === undefined || args.shares === undefined) {
        continue;
      }

      const meta = logMeta(log);
      const row = {
        chain_id: CHAIN_ID,
        vault_address: vault.toLowerCase(),
        wallet_address: args.owner.toLowerCase(),
        assets: formatUnitsToDecimal(args.assets, USDC_DECIMALS),
        shares: args.shares.toString(),
        tx_hash: meta.tx_hash,
        block_number: meta.block_number,
        log_index: meta.log_index,
        timestamp: null as string | null,
      };

      if (log.blockNumber) {
        try {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          row.timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
        } catch {
          // optional
        }
      }

      const { error } = await supabase.from(withdrawalsTable).upsert(row, {
        onConflict: "chain_id,tx_hash,log_index",
        ignoreDuplicates: true,
      });

      if (error) {
        errors.push(`withdraw ${meta.tx_hash}: ${error.message}`);
      } else {
        withdrawalsIndexed += 1;
      }
    }

    const feeLogs = await client.getLogs({
      address: vault as Address,
      event: feeEvent,
      fromBlock,
      toBlock,
    });

    for (const log of feeLogs) {
      const args = log.args as {
        grossYield?: bigint;
        fee?: bigint;
        timestamp?: bigint;
      };
      if (args.grossYield === undefined || args.fee === undefined) {
        continue;
      }

      const meta = logMeta(log);
      const row = {
        chain_id: CHAIN_ID,
        vault_address: vault.toLowerCase(),
        gross_yield: formatUnitsToDecimal(args.grossYield, USDC_DECIMALS),
        fee: formatUnitsToDecimal(args.fee, USDC_DECIMALS),
        tx_hash: meta.tx_hash,
        block_number: meta.block_number,
        timestamp: args.timestamp
          ? new Date(Number(args.timestamp) * 1000).toISOString()
          : null,
      };

      const { error } = await supabase.from(feeTable).insert(row);
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        errors.push(`fee ${meta.tx_hash}: ${error.message}`);
      } else if (!error) {
        feesIndexed += 1;
      }
    }

    await setCursor(vault.toLowerCase(), toBlock);

    return {
      fromBlock,
      toBlock,
      depositsIndexed,
      withdrawalsIndexed,
      feesIndexed,
      errors,
      status: errors.length ? "error" : "ok",
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Index failed.");
    return {
      fromBlock,
      toBlock,
      depositsIndexed,
      withdrawalsIndexed,
      feesIndexed,
      errors,
      status: "error",
      message: "Failed to read logs from Arc RPC.",
    };
  }
}
