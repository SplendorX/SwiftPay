import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  type Chain,
  type Hash,
} from "viem";

import { allieProFeeRecipient } from "@/lib/allie/monetization";
import { getPlatformFeeRecipientAddresses } from "@/lib/arcscan-history";
import { onchainFacts } from "@/lib/onchain-facts";
import { arcTokens, type ArcTokenSymbol } from "@/lib/tokens";

const transferEventAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
/** Emitted by the Swift Save vault for every pocket deposit, incl. Spend&Save legs. */
const depositedEventAbi = parseAbi([
  "event Deposited(address indexed owner, bytes32 indexed pocketId, address indexed token, uint256 amount)",
]);
const feeRecipientAbi = parseAbi(["function feeRecipient() view returns (address)"]);
/** Cap on contracts probed for a fee recipient per transaction. */
const maxFeeProbes = 8;

export type VerifiedOutflow = {
  /** Decimal amount the wallet sent in `token` within the transaction. */
  amount: number;
  token: ArcTokenSymbol;
  /** Gross `token` amount sent to each recipient (lowercase address). */
  payees: Record<string, number>;
  /** Platform fees the wallet paid in `token` within the transaction. */
  feePaid: number;
};

/**
 * What a wallet actually paid someone in a confirmed Arc transaction, per
 * stablecoin: everything it sent out, minus fees, minus its own savings
 * deposits, minus anything returned to it — so neither fees nor Spend&Save
 * pocket legs earn cashback.
 *
 * Both exclusions are read from the chain, not only from configuration:
 * - Savings: every Swift Save `Deposited` event owned by the wallet, whatever
 *   the vault's address (Spend&Save routes the leg through the send router).
 * - Fees: the `feeRecipient()` of each contract that took part (send router,
 *   BatchPay, Recurepay, payroll), plus the configured fee wallets for direct
 *   fee legs and ALLIE fees.
 * Either signal can only lower the wallet's own cashback, so a contract that
 * emits fake events or reports a bogus fee recipient cannot raise a reward. Reading token
 * events (not `tx.from`) works for Circle smart-contract wallets, whose
 * transactions are submitted by a bundler. Returns null when the transaction
 * failed, is not yet mined, or moved none of the wallet's stablecoins.
 */
export async function verifyWalletOutflow(
  txHash: Hash,
  wallet: string,
): Promise<VerifiedOutflow | null> {
  const client = createPublicClient({
    chain: onchainFacts.chain as Chain,
    transport: http(onchainFacts.rpcUrl),
  });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return null;
  }
  if (receipt.status !== "success") {
    return null;
  }

  const tokenAddresses = new Set(
    Object.values(arcTokens).map((token) => token.address.toLowerCase()),
  );
  const participants = [
    ...new Set(
      receipt.logs
        .map((log) => log.address.toLowerCase())
        .filter((address) => !tokenAddresses.has(address)),
    ),
  ].slice(0, maxFeeProbes);
  const onchainFeeRecipients = (
    await Promise.allSettled(
      participants.map((address) =>
        client.readContract({
          abi: feeRecipientAbi,
          address: address as `0x${string}`,
          functionName: "feeRecipient",
        }),
      ),
    )
  ).flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

  return netPayeeOutflow({
    logs: receipt.logs,
    nonPayees: [
      ...getPlatformFeeRecipientAddresses(),
      allieProFeeRecipient(),
      ...onchainFeeRecipients,
    ],
    tokens: arcTokens,
    wallet,
  });
}

type TransferLog = { address: string; data: `0x${string}`; topics: readonly `0x${string}`[] | [] };

/** Pure netting behind `verifyWalletOutflow`; exported for tests. */
export function netPayeeOutflow(input: {
  logs: readonly TransferLog[];
  nonPayees: string[];
  tokens: Record<string, { address: string; decimals: number }>;
  wallet: string;
}): VerifiedOutflow | null {
  const sender = getAddress(input.wallet);
  // Money that never reached a payee: fees and the user's own savings.
  const nonPayees = new Set(
    input.nonPayees.filter(Boolean).map((address) => address.toLowerCase()),
  );
  const tokenByAddress = new Map(
    Object.entries(input.tokens).map(([symbol, info]) => [
      info.address.toLowerCase(),
      symbol as ArcTokenSymbol,
    ]),
  );
  const totals = new Map<ArcTokenSymbol, bigint>();
  const add = (symbol: ArcTokenSymbol, value: bigint) =>
    totals.set(symbol, (totals.get(symbol) ?? 0n) + value);
  const payees = new Map<ArcTokenSymbol, Map<string, bigint>>();
  const fees = new Map<ArcTokenSymbol, bigint>();
  const addPayee = (symbol: ArcTokenSymbol, to: string, value: bigint) => {
    const byPayee = payees.get(symbol) ?? new Map<string, bigint>();
    byPayee.set(to, (byPayee.get(to) ?? 0n) + value);
    payees.set(symbol, byPayee);
  };

  for (const log of input.logs) {
    // The wallet's own savings deposits are not payments.
    try {
      const deposit = decodeEventLog({
        abi: depositedEventAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      const depositToken = tokenByAddress.get(deposit.args.token.toLowerCase());
      if (depositToken && getAddress(deposit.args.owner) === sender) {
        add(depositToken, -deposit.args.amount);
      }
      continue;
    } catch {
      // Not a Deposited event.
    }

    const symbol = tokenByAddress.get(log.address.toLowerCase());
    if (!symbol) continue;
    try {
      const event = decodeEventLog({
        abi: transferEventAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      const from = getAddress(event.args.from);
      const to = getAddress(event.args.to);
      if (from === to) continue;
      if (from === sender) {
        add(symbol, event.args.value);
        if (nonPayees.has(to.toLowerCase())) {
          fees.set(symbol, (fees.get(symbol) ?? 0n) + event.args.value);
        } else {
          addPayee(symbol, to.toLowerCase(), event.args.value);
        }
      }
      if (to === sender || nonPayees.has(to.toLowerCase())) {
        add(symbol, -event.args.value);
      }
    } catch {
      // Not a Transfer event.
    }
  }

  let best: VerifiedOutflow | null = null;
  for (const [symbol, value] of totals) {
    if (value <= 0n) continue;
    const amount = Number(formatUnits(value, input.tokens[symbol].decimals));
    if (amount > 0 && (!best || amount > best.amount)) {
      const decimals = input.tokens[symbol].decimals;
      best = {
        amount,
        feePaid: Number(formatUnits(fees.get(symbol) ?? 0n, decimals)),
        token: symbol,
        payees: Object.fromEntries(
          [...(payees.get(symbol) ?? [])].map(([to, units]) => [
            to,
            Number(formatUnits(units, decimals)),
          ]),
        ),
      };
    }
  }
  return best;
}

