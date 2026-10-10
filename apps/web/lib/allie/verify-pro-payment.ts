// Server-only: reads the Arc chain to check a Pro payment before granting Pro.
import {
  createPublicClient,
  erc20Abi,
  getAddress,
  type Chain,
  isAddress,
  parseEventLogs,
  parseUnits,
  type Hash,
} from "viem";

import { onchainFacts } from "@/lib/onchain-facts";
import { arcTokens } from "@/lib/tokens";
import { arcTransport } from "@/lib/chains";

/** A Pro payment must be this recent to activate Pro. */
const maxPaymentAgeMs = 2 * 60 * 60 * 1000;

let client: ReturnType<typeof createPublicClient> | null = null;
function arcClient() {
  client ??= createPublicClient({
    chain: onchainFacts.chain as Chain,
    transport: arcTransport(),
  });
  return client;
}

export type ProPaymentCheck =
  | { ok: true; paidAt: Date }
  /** `retryable`: the payment may still confirm; the same hash can be tried again. */
  | { ok: false; reason: string; retryable?: boolean };

/** How long activation waits for a just-sent payment to land in a block. */
const receiptWaitMs = 20_000;

/**
 * Confirms on Arc that `txHash` is a successful USDC transfer of at least the
 * Pro fee, from the owner's own wallet to the Pro fee recipient, made within
 * the last two hours. Replays of an older payment are caught by the caller,
 * which compares `paidAt` with the last activation.
 */
export async function verifyAllieProPayment(input: {
  txHash: string;
  ownerWallet: string;
  feeRecipient: string;
  feeUsdc: number;
}): Promise<ProPaymentCheck> {
  if (!isAddress(input.feeRecipient)) {
    return { ok: false, reason: "The Pro fee recipient is not configured." };
  }

  const owner = getAddress(input.ownerWallet);
  const recipient = getAddress(input.feeRecipient);
  const usdc = getAddress(arcTokens.USDC.address);
  const required = parseUnits(input.feeUsdc.toFixed(6), arcTokens.USDC.decimals);

  let receipt;
  try {
    // A payment broadcast moments ago is usually a block or two away.
    receipt = await arcClient().waitForTransactionReceipt({
      hash: input.txHash as Hash,
      timeout: receiptWaitMs,
    });
  } catch {
    return {
      ok: false,
      reason: "That payment isn't confirmed on Arc yet. Wait a moment and try again — you won't be charged again.",
      retryable: true,
    };
  }

  if (receipt.status !== "success") {
    return { ok: false, reason: "That payment failed on-chain, so Pro was not activated." };
  }

  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs });
  const paid = transfers
    .filter(
      (log) =>
        getAddress(log.address) === usdc &&
        getAddress(log.args.from) === owner &&
        getAddress(log.args.to) === recipient,
    )
    .reduce((sum, log) => sum + log.args.value, 0n);

  if (paid < required) {
    return {
      ok: false,
      reason: `That transaction doesn't pay the ${input.feeUsdc} USDC Pro fee from this wallet.`,
    };
  }

  const block = await arcClient().getBlock({ blockNumber: receipt.blockNumber });
  const paidAt = new Date(Number(block.timestamp) * 1000);
  if (Date.now() - paidAt.getTime() > maxPaymentAgeMs) {
    return { ok: false, reason: "That payment is too old to activate Pro. Make a new payment." };
  }

  return { ok: true, paidAt };
}
