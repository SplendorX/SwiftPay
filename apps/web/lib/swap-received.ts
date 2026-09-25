import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  type Hash,
} from "viem";

import { arcChain } from "@/lib/chains";
import { arcTokens, type ArcTokenSymbol } from "@/lib/tokens";

const transferEventAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

/**
 * How much of `token` a swap actually delivered to `wallet`, read from the
 * transaction's Transfer events on Arc. Circle's swap result does not always
 * report the output amount, so this is the source of truth for "Received".
 * Returns null if the receipt is not available within `timeoutMs` or shows
 * nothing arriving, so the caller can fall back to the quote.
 */
export async function readSwapReceived(input: {
  timeoutMs?: number;
  token: ArcTokenSymbol;
  txHash: string;
  wallet: string;
}): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) {
    return null;
  }

  const client = createPublicClient({
    chain: arcChain,
    transport: http(arcChain.rpcUrls.default.http[0]),
  });

  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: input.txHash as Hash,
      timeout: input.timeoutMs ?? 20_000,
    });
  } catch {
    return null;
  }
  if (receipt.status !== "success") {
    return null;
  }

  const tokenInfo = arcTokens[input.token];
  const recipient = getAddress(input.wallet);
  let received = 0n;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenInfo.address.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: transferEventAbi,
        data: log.data,
        topics: log.topics,
      });
      if (
        getAddress(event.args.to) === recipient &&
        getAddress(event.args.from) !== recipient
      ) {
        received += event.args.value;
      }
    } catch {
      // Not a Transfer event.
    }
  }

  if (received === 0n) {
    return null;
  }

  // Plain decimal (no locale grouping), trimmed to 6 places: it is shown and
  // also stored as the activity amount.
  const [whole, fraction = ""] = formatUnits(received, tokenInfo.decimals).split(".");
  const trimmed = fraction.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}
