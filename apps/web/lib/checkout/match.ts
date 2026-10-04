/**
 * Hash-less matching for card/bank (Circle Onramp) and bridge payments: they
 * land in the merchant wallet without an Arc transaction hash the payer page
 * can post, so incoming transfers are paired with charges waiting on them.
 * Pure, so the tests exercise exactly what the scan runs.
 */
import { moneyNumber } from "@/lib/account/money";
import type { ChargeCurrency } from "@/lib/checkout/types";

/**
 * Blocks a transfer must age before the matcher may take it (~1 minute on
 * Arc), so a receipt-based confirm from the payer page always wins first.
 */
export const MATCH_GRACE_BLOCKS = 120;
export const MATCH_MIN_TOLERANCE = 0.05;
export const MATCH_TOLERANCE_RATIO = 0.01;

export type MatchTransfer = {
  hash: string;
  amount: string | number;
  symbol: string;
  blockNumber: number;
  from: string;
};

export type MatchCharge = {
  id: string;
  currency: ChargeCurrency;
  amount: string;
  tip_amount: string;
  amount_received: string;
  reported_amount: string | null;
  created_block: number | string | null;
  pending_started_at: string | null;
  created_at: string;
};

export type ChargeMatch = { chargeId: string; transfer: MatchTransfer };

/** What the charge expects to receive: the amount the widget reported, else what is left plus the tip. */
export function matchTarget(charge: MatchCharge) {
  if (charge.reported_amount && moneyNumber(charge.reported_amount) > 0) {
    return moneyNumber(charge.reported_amount);
  }
  return Math.max(
    0,
    moneyNumber(charge.amount) + moneyNumber(charge.tip_amount) - moneyNumber(charge.amount_received),
  );
}

export function matchTolerance(target: number) {
  return Math.max(MATCH_MIN_TOLERANCE, target * MATCH_TOLERANCE_RATIO);
}

function intentTime(charge: MatchCharge) {
  return Date.parse(charge.pending_started_at ?? charge.created_at) || 0;
}

/**
 * Pairs transfers with charges, one to one. Transfers are taken oldest
 * first; each goes to the open charge in the same currency whose target is
 * closest (within tolerance), ties to the oldest intent. A transfer is
 * skipped when it is too fresh, already claimed, mined before the charge
 * existed, or sent by a wallet that is paying one of the merchant's charges
 * directly (that payment confirms itself by receipt).
 */
export function selectMatches(input: {
  transfers: readonly MatchTransfer[];
  charges: readonly MatchCharge[];
  headBlock: number;
  claimedHashes: ReadonlySet<string>;
  excludedSenders: ReadonlySet<string>;
}): ChargeMatch[] {
  const transfers = [...input.transfers].sort((left, right) => left.blockNumber - right.blockNumber);
  const available = new Map(input.charges.map((charge) => [charge.id, charge]));
  const matches: ChargeMatch[] = [];

  for (const transfer of transfers) {
    if (available.size === 0) break;
    const hash = transfer.hash.toLowerCase();
    if (input.claimedHashes.has(hash)) continue;
    if (input.headBlock - transfer.blockNumber < MATCH_GRACE_BLOCKS) continue;
    if (input.excludedSenders.has(transfer.from.toLowerCase())) continue;
    const received = moneyNumber(String(transfer.amount));
    if (received <= 0) continue;

    let best: { charge: MatchCharge; distance: number } | null = null;
    for (const charge of available.values()) {
      if (charge.currency !== transfer.symbol) continue;
      if (charge.created_block === null || transfer.blockNumber < Number(charge.created_block)) continue;
      const target = matchTarget(charge);
      if (target <= 0) continue;
      const distance = Math.abs(received - target);
      if (distance > matchTolerance(target) + 1e-9) continue;
      if (
        !best ||
        distance < best.distance - 1e-9 ||
        (Math.abs(distance - best.distance) <= 1e-9 && intentTime(charge) < intentTime(best.charge))
      ) {
        best = { charge, distance };
      }
    }

    if (best) {
      matches.push({ chargeId: best.charge.id, transfer: { ...transfer, hash } });
      available.delete(best.charge.id);
    }
  }

  return matches;
}
