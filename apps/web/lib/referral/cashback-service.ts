import { getAddress, isAddress } from "viem";
import { stablecoinUsdValue } from "@/lib/referral/fx";
import { recordLedgerEntry, getOrCreateSwiftPointsAccount } from "@/lib/referral/ledger-service";
import { SWIFTPOINTS_USD_PER_POINT } from "@/lib/referral/types";

/**
 * General Platform Cashback Tier Structure for all SwiftPay accounts.
 *
 * Tier thresholds are in USD value (USDC 1:1, EURC at the live EUR→USD rate):
 * - $1000+ -> 50 SwiftPoints
 * - $500+  -> 20 SwiftPoints
 * - $100+  -> 5 SwiftPoints
 * - $20+   -> 1 SwiftPoint
 * - Below $20 -> 0 SwiftPoints
 */
export const GENERAL_CASHBACK_BRACKETS = [
  { minAmount: 1000, points: 50, label: "1,000+" },
  { minAmount: 500, points: 20, label: "500+" },
  { minAmount: 100, points: 5, label: "100+" },
  { minAmount: 20, points: 1, label: "20+" },
] as const;

export type CashbackTierCalculation = {
  eligible: boolean;
  points: number;
  usdcValue: number;
  tierLabel?: string;
  nextTier?: {
    threshold: number;
    points: number;
    needed: number;
  };
};

/**
 * Calculates the cashback earned for a transaction. Thresholds are in USD and
 * inclusive (>=): 20+, 100+, 500+, 1000+. Pass `usdPerToken` for EURC; the
 * amount still needed for the next tier comes back in the token itself.
 */
export function calculateTransactionCashback(
  amountInput: number | string,
  usdPerToken = 1,
): CashbackTierCalculation {
  const tokenAmount = typeof amountInput === "string" ? parseFloat(amountInput.trim()) : amountInput;
  const rate = Number.isFinite(usdPerToken) && usdPerToken > 0 ? usdPerToken : 1;
  const numericAmount = tokenAmount * rate;
  const inToken = (usd: number) => Math.max(0, Number((usd / rate).toFixed(2)));

  if (isNaN(numericAmount) || numericAmount < 20) {
    return {
      eligible: false,
      points: 0,
      usdcValue: 0,
      nextTier: {
        threshold: 20,
        points: 1,
        needed: inToken(20 - (isNaN(numericAmount) ? 0 : numericAmount)),
      },
    };
  }

  for (let i = 0; i < GENERAL_CASHBACK_BRACKETS.length; i++) {
    const bracket = GENERAL_CASHBACK_BRACKETS[i];
    if (numericAmount >= bracket.minAmount) {
      const prevBracket = GENERAL_CASHBACK_BRACKETS[i - 1];
      return {
        eligible: true,
        points: bracket.points,
        usdcValue: Number((bracket.points * SWIFTPOINTS_USD_PER_POINT).toFixed(2)),
        tierLabel: bracket.label,
        nextTier: prevBracket
          ? {
              threshold: prevBracket.minAmount,
              points: prevBracket.points,
              needed: inToken(prevBracket.minAmount - numericAmount),
            }
          : undefined,
      };
    }
  }

  return {
    eligible: false,
    points: 0,
    usdcValue: 0,
  };
}

export type ProcessCashbackParams = {
  walletAddress: string;
  amount: number | string;
  token?: string; // "USDC" | "EURC"
  transactionId?: string;
  txHash?: string;
  /**
   * Platform fee the transaction paid, in `token`. When given, cashback is
   * capped at the fee's value (1 point = $0.01), so no transaction can earn
   * more in points than SwiftPay earned from it and moving money between
   * one's own wallets is never profitable.
   */
  feePaid?: number;
};

/** What one SwiftPoint redeems for, in USD. */
const usdPerPoint = 0.01;

export type ProcessCashbackResult = {
  eligible: boolean;
  pointsAwarded: number;
  usdcValue: number;
  alreadyProcessed?: boolean;
  ledgerEntryId?: string;
  token: string;
};

/**
 * Executes and credits general transaction cashback to a user's SwiftPoints ledger.
 * Fully atomic, immutable, and idempotent.
 */
export async function processTransactionCashback(
  params: ProcessCashbackParams,
): Promise<ProcessCashbackResult> {
  const { walletAddress, amount, feePaid, token = "USDC", transactionId, txHash } = params;

  if (!walletAddress || !isAddress(walletAddress)) {
    throw new Error("A valid wallet address is required to award transaction cashback.");
  }

  const normalizedWallet = getAddress(walletAddress).toLowerCase();
  const normalizedToken = token.toUpperCase();
  const tokenAmount = typeof amount === "string" ? parseFloat(amount.trim()) : amount;
  // Tiers are priced in USD, so EURC is valued at the live rate first.
  const usdValue = Number.isFinite(tokenAmount)
    ? await stablecoinUsdValue(tokenAmount, normalizedToken)
    : 0;
  const tierCalculation = calculateTransactionCashback(usdValue);
  let calculation = tierCalculation;
  if (feePaid !== undefined && tierCalculation.eligible) {
    const feeUsd = Number.isFinite(feePaid) && feePaid > 0
      ? await stablecoinUsdValue(feePaid, normalizedToken)
      : 0;
    const affordable = Math.floor(feeUsd / usdPerPoint + 1e-9);
    if (affordable < tierCalculation.points) {
      calculation = {
        ...tierCalculation,
        eligible: affordable > 0,
        points: affordable,
        usdcValue: Number((affordable * usdPerPoint).toFixed(2)),
      };
    }
  }

  if (!calculation.eligible || calculation.points <= 0) {
    return {
      eligible: false,
      pointsAwarded: 0,
      usdcValue: 0,
      token: normalizedToken,
    };
  }

  // Ensure SwiftPoints account exists
  await getOrCreateSwiftPointsAccount(normalizedWallet);

  const identifier = transactionId || txHash || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const idempotencyKey = `tx_cashback_${normalizedWallet}_${identifier}`;
  const amountStr = typeof amount === "number" ? amount.toString() : amount;

  try {
    const pointsText = calculation.points === 1 ? "1 SwiftPoint" : `${calculation.points} SwiftPoints`;
    const ledgerResult = await recordLedgerEntry({
      walletAddress: normalizedWallet,
      entryType: "REFERRER_PERSONAL_ACTIVITY_CASHBACK",
      points: calculation.points,
      idempotencyKey,
      description: `Transaction cashback: ${pointsText} for a $${calculation.tierLabel} transaction (${amountStr} ${normalizedToken}${
        normalizedToken === "USDC" ? "" : `, about $${usdValue.toFixed(2)}`
      })`,
      metadata: {
        source: "general_transaction_cashback",
        amount: amountStr,
        token: normalizedToken,
        usdValue: Number(usdValue.toFixed(2)),
        txHash: txHash ?? null,
        transactionId: transactionId ?? null,
        tierLabel: calculation.tierLabel,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      eligible: true,
      pointsAwarded: calculation.points,
      usdcValue: calculation.usdcValue,
      ledgerEntryId: ledgerResult.entry.id,
      alreadyProcessed: ledgerResult.alreadyProcessed,
      token: normalizedToken,
    };
  } catch (error) {
    // If already processed via idempotency, return successfully without re-crediting
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("idempotency") || msg.includes("23505")) {
      return {
        eligible: true,
        pointsAwarded: calculation.points,
        usdcValue: calculation.usdcValue,
        alreadyProcessed: true,
        token: normalizedToken,
      };
    }
    throw error;
  }
}
