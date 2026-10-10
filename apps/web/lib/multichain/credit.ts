// Server-only.
/**
 * Proof that a sweep arrived. Circle's attestation API (IRIS) says where the
 * burn went and which Arc transaction the Forwarding Service minted it in;
 * the Arc RPC then says how much actually reached the owner. Only the second
 * answer credits anyone.
 */
import { createPublicClient, getAddress, http, parseEventLogs, parseAbiItem, type Hash } from "viem";

import type { MultichainChain } from "@/lib/multichain/chains";

import { createArcRpcClient, NATIVE_USDC_EVENT_ADDRESS } from "@/lib/arc-transfers";
import { isArcMainnet } from "@/lib/network";
import { nativeArcToUnits } from "@/lib/multichain/rules";

function irisBase() {
  return isArcMainnet() ? "https://iris-api.circle.com" : "https://iris-api-sandbox.circle.com";
}

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export type IrisMessage = {
  /** Units burned, before Circle's fee. */
  amount: string | null;
  destinationDomain: number | null;
  /** Units Circle kept (fast and forward fees). */
  feeExecuted: string | null;
  forwardState: string | null;
  forwardTxHash: string | null;
  mintRecipient: string | null;
  status: string | null;
};

/**
 * The CCTP message a source-chain transaction emitted, or null when that
 * transaction burned nothing (an approve, say) or IRIS has not indexed it yet.
 */
export async function readIrisMessage(sourceDomain: number, txHash: string): Promise<IrisMessage | null> {
  const response = await fetch(
    `${irisBase()}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(txHash)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Circle attestation lookup failed (${response.status}).`);
  const payload = (await response.json().catch(() => null)) as {
    messages?: {
      decodedMessage?: {
        destinationDomain?: string;
        decodedMessageBody?: { amount?: string; feeExecuted?: string; mintRecipient?: string } | null;
      } | null;
      destinationMintTxHash?: string | null;
      forwardState?: string | null;
      forwardTxHash?: string | null;
      status?: string | null;
    }[];
  } | null;
  const message = payload?.messages?.[0];
  if (!message) return null;
  const body = message.decodedMessage?.decodedMessageBody;
  const domain = Number(message.decodedMessage?.destinationDomain);
  return {
    amount: body?.amount ?? null,
    destinationDomain: Number.isFinite(domain) ? domain : null,
    feeExecuted: body?.feeExecuted ?? null,
    forwardState: message.forwardState ?? null,
    forwardTxHash: message.forwardTxHash ?? message.destinationMintTxHash ?? null,
    mintRecipient: body?.mintRecipient?.toLowerCase() ?? null,
    status: message.status ?? null,
  };
}

/**
 * USDC a destination-network transaction minted to `recipient`, in units:
 * the delivery of a send, read from that network's own RPC. Null while it is
 * not mined (or the RPC is unreachable), 0n if it minted nothing to them.
 */
export async function usdcDeliveredTo(chain: MultichainChain, txHash: string, recipient: string): Promise<bigint | null> {
  const url = process.env[`MULTICHAIN_RPC_${chain.key.toUpperCase()}`]?.trim() || chain.rpcUrl;
  const client = createPublicClient({ transport: http(url, { retryCount: 2, retryDelay: 500 }) });
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as Hash });
  } catch {
    return null;
  }
  if (receipt.status !== "success") return 0n;
  const self = getAddress(recipient);
  const usdc = chain.usdcAddress.toLowerCase();
  let total = 0n;
  for (const log of parseEventLogs({ abi: [transferEvent], logs: receipt.logs, strict: false })) {
    if (log.address.toLowerCase() !== usdc) continue;
    if (log.args.to && getAddress(log.args.to) === self && typeof log.args.value === "bigint") total += log.args.value;
  }
  return total;
}

/**
 * USDC an Arc transaction took out of `owner`'s wallet, in 6-decimal units.
 * Proves a burn was the owner's own money whatever wallet type signed it (a
 * smart account's transaction is sent by a bundler, not by the owner).
 */
export async function usdcSentFrom(txHash: string, owner: string): Promise<bigint | null> {
  const client = createArcRpcClient();
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as Hash });
  } catch {
    return null;
  }
  if (receipt.status !== "success") return 0n;
  const self = getAddress(owner);
  let total = 0n;
  for (const log of parseEventLogs({ abi: [transferEvent], logs: receipt.logs, strict: false })) {
    if (log.address.toLowerCase() !== NATIVE_USDC_EVENT_ADDRESS) continue;
    if (log.args.from && getAddress(log.args.from) === self && typeof log.args.value === "bigint") {
      total += log.args.value;
    }
  }
  return nativeArcToUnits(total);
}

/**
 * The burn that followed `reportedHash`, when the wallet reported the wrong
 * transaction (an approve, which moves nothing). Looks a few minutes of
 * blocks ahead for USDC leaving `owner` in exactly `amountUnits`. IRIS
 * still checks recipient and network before anything completes.
 */
export async function findFollowingBurn(
  reportedHash: string,
  owner: string,
  amountUnits: bigint,
): Promise<string | null> {
  const client = createArcRpcClient();
  let fromBlock: bigint;
  let latest: bigint;
  try {
    fromBlock = (await client.getTransactionReceipt({ hash: reportedHash as Hash })).blockNumber;
    latest = await client.getBlockNumber();
  } catch {
    return null;
  }
  const self = getAddress(owner);
  const lastBlock = fromBlock + 3_000n < latest ? fromBlock + 3_000n : latest;
  // Public RPCs cap each log query to about a thousand blocks.
  for (let start = fromBlock; start <= lastBlock; start += 900n) {
    const end = start + 899n < lastBlock ? start + 899n : lastBlock;
    let logs;
    try {
      logs = await client.getLogs({
        address: NATIVE_USDC_EVENT_ADDRESS as `0x${string}`,
        args: { from: self },
        event: transferEvent,
        fromBlock: start,
        toBlock: end,
      });
    } catch {
      return null;
    }
    const match = logs.find(
      (log) =>
        log.transactionHash.toLowerCase() !== reportedHash.toLowerCase() &&
        typeof log.args.value === "bigint" &&
        nativeArcToUnits(log.args.value) === amountUnits,
    );
    if (match) return match.transactionHash.toLowerCase();
  }
  return null;
}

/**
 * USDC an Arc transaction delivered to `owner`, in 6-decimal units, read from
 * the native USDC event (counts each movement once). Null while the
 * transaction is not mined; 0n if it paid someone else.
 */
export async function usdcMintedTo(mintTxHash: string, owner: string): Promise<bigint | null> {
  const client = createArcRpcClient();
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: mintTxHash as Hash });
  } catch {
    return null;
  }
  if (receipt.status !== "success") return 0n;
  const self = getAddress(owner);
  const logs = parseEventLogs({ abi: [transferEvent], logs: receipt.logs, strict: false }).filter(
    (log) => log.address.toLowerCase() === NATIVE_USDC_EVENT_ADDRESS,
  );
  let total = 0n;
  for (const log of logs) {
    if (log.args.to && getAddress(log.args.to) === self && typeof log.args.value === "bigint") {
      total += log.args.value;
    }
  }
  return nativeArcToUnits(total);
}
