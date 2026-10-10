// Server-only. Reads an invoice payment off the chain instead of trusting the
// payer's browser for it.
import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  getAddress,
  parseAbi,
  type Chain,
  type Hash,
} from "viem";

import { onchainFacts } from "@/lib/onchain-facts";
import { arcTransport } from "@/lib/chains";

const transferEventAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

type TransferLog = { address: string; data: `0x${string}`; topics: readonly `0x${string}`[] | [] };

/**
 * How much of `token` a confirmed transaction delivered to `destination`,
 * as a decimal, or null when it failed, isn't mined yet, or paid nothing
 * there. Counts every Transfer into the wallet, so a payment routed through
 * SaphraONE's send router (fee split off on the way) credits what arrived.
 */
export async function verifyInvoiceTransfer(input: {
  txHash: Hash;
  token: { address: string; decimals: number };
  destination: string;
}): Promise<number | null> {
  const client = createPublicClient({
    chain: onchainFacts.chain as Chain,
    transport: arcTransport(),
  });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: input.txHash });
  } catch {
    return null;
  }
  if (receipt.status !== "success") return null;

  return receivedAmount({ logs: receipt.logs, token: input.token, destination: input.destination });
}

/** Pure part of `verifyInvoiceTransfer`; exported for tests. */
export function receivedAmount(input: {
  logs: readonly TransferLog[];
  token: { address: string; decimals: number };
  destination: string;
}): number | null {
  const destination = getAddress(input.destination);
  const tokenAddress = input.token.address.toLowerCase();
  let total = 0n;

  for (const log of input.logs) {
    if (log.address.toLowerCase() !== tokenAddress) continue;
    try {
      const event = decodeEventLog({
        abi: transferEventAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (getAddress(event.args.to) === destination && getAddress(event.args.from) !== destination) {
        total += event.args.value;
      }
    } catch {
      // Not a Transfer event.
    }
  }

  if (total <= 0n) return null;
  return Number(formatUnits(total, input.token.decimals));
}
