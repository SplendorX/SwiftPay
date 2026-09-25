import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Chain,
  type Hash,
} from "viem";

import { readReferralDbError, referralDb, referralTables } from "@/lib/referral/db";
import { recordLedgerEntry } from "@/lib/referral/ledger-service";
import { platformFeeRecipient } from "@/lib/fees";
import { onchainFacts } from "@/lib/onchain-facts";
import type { SwiftPointsPurchaseRecord } from "@/lib/referral/types";

/**
 * Buying SwiftPoints with on-chain USDC.
 *
 * Points are money-adjacent, so nothing is credited on a client's say-so. The
 * caller supplies a transaction hash and the server proves, from the chain,
 * that the claiming wallet really paid the treasury — then credits the
 * matching points. The unique `tx_hash` column stops one payment being
 * credited twice.
 */

/** 100 SwiftPoints per USDC, matching SWIFTPOINTS_USD_PER_POINT. */
export const POINTS_PER_USDC = 100;
export const MINIMUM_PURCHASE_POINTS = 100;

const transferEventAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

/** Where purchase payments must land. */
export function pointsTreasuryAddress(): Address | null {
  const configured =
    process.env.SWIFTPOINTS_TREASURY_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_SWIFTPOINTS_TREASURY_ADDRESS?.trim() ||
    platformFeeRecipient();

  return configured && isAddress(configured) ? getAddress(configured) : null;
}

export function pointsForUsdc(usdcAmount: number) {
  return Math.floor(usdcAmount * POINTS_PER_USDC);
}

function publicClient() {
  return createPublicClient({
    chain: onchainFacts.chain as Chain,
    transport: http(onchainFacts.rpcUrl),
  });
}

/**
 * Credit points for a USDC payment already made on Arc.
 *
 * Every check below is a way someone could otherwise mint points for free:
 * replaying another wallet's payment, paying the wrong address, paying less
 * than claimed, or submitting the same hash twice.
 */
export async function purchaseSwiftPoints(input: {
  txHash: string;
  walletAddress: string;
}): Promise<SwiftPointsPurchaseRecord> {
  const wallet = input.walletAddress.toLowerCase();
  const treasury = pointsTreasuryAddress();

  if (!treasury) {
    throw new Error(
      "Buying SwiftPoints is not configured: set SWIFTPOINTS_TREASURY_ADDRESS.",
    );
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) {
    throw new Error("A valid transaction hash is required.");
  }

  const supabase = referralDb();

  const existing = await supabase
    .from(referralTables.purchases)
    .select("*")
    .eq("tx_hash", input.txHash.toLowerCase())
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      readReferralDbError(existing.error, "Failed checking the payment."),
    );
  }

  if (existing.data) {
    const record = existing.data as SwiftPointsPurchaseRecord;
    if (record.wallet_address !== wallet) {
      throw new Error("That payment was already credited to another wallet.");
    }
    return record;
  }

  // The client posts the hash the moment its wallet returns it, which can be
  // before the RPC node has the receipt. Wait for it rather than failing a
  // payment that has already left the wallet.
  const receipt = await publicClient()
    .waitForTransactionReceipt({
      hash: input.txHash as Hash,
      pollingInterval: 1_500,
      timeout: 45_000,
    })
    .catch(() => null);

  if (!receipt) {
    throw new Error(
      "That transaction is not on Arc yet. Wait for it to confirm and try again.",
    );
  }

  if (receipt.status !== "success") {
    throw new Error("That transaction reverted, so no points were bought.");
  }

  const usdcAddress = onchainFacts.usdcAddress;
  if (!usdcAddress) {
    throw new Error("USDC is not configured for this network.");
  }

  // Sum every USDC transfer from this wallet to the treasury in the tx, so a
  // split payment still adds up and an unrelated log cannot inflate it.
  let paidUnits = BigInt(0);
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(usdcAddress)) continue;
    try {
      const decoded = decodeEventLog({
        abi: transferEventAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") continue;
      const { from, to, value } = decoded.args;
      if (getAddress(from).toLowerCase() !== wallet) continue;
      if (getAddress(to) !== treasury) continue;
      paidUnits += value;
    } catch {
      // Not a Transfer log; ignore it.
    }
  }

  if (paidUnits <= BigInt(0)) {
    throw new Error(
      "That transaction does not contain a USDC payment from your wallet to the SwiftPoints treasury.",
    );
  }

  const usdcAmount = Number(paidUnits) / 1e6;
  const points = pointsForUsdc(usdcAmount);

  if (points < MINIMUM_PURCHASE_POINTS) {
    throw new Error(
      `The smallest purchase is ${MINIMUM_PURCHASE_POINTS} SwiftPoints (${
        MINIMUM_PURCHASE_POINTS / POINTS_PER_USDC
      } USDC).`,
    );
  }

  const { entry } = await recordLedgerEntry({
    description: `Bought ${points} SwiftPoints for ${usdcAmount.toFixed(2)} USDC`,
    entryType: "PURCHASE",
    idempotencyKey: `purchase:${input.txHash.toLowerCase()}`,
    metadata: { txHash: input.txHash.toLowerCase(), usdcAmount },
    points,
    transactionId: input.txHash.toLowerCase(),
    walletAddress: wallet,
  });

  const inserted = await supabase
    .from(referralTables.purchases)
    .insert({
      chain_id: onchainFacts.chainId,
      ledger_entry_id: entry.id,
      points,
      status: "COMPLETED",
      tx_hash: input.txHash.toLowerCase(),
      usdc_amount: usdcAmount,
      wallet_address: wallet,
    })
    .select("*")
    .single();

  if (inserted.error) {
    throw new Error(
      readReferralDbError(inserted.error, "Points were credited but the record failed."),
    );
  }

  return inserted.data as SwiftPointsPurchaseRecord;
}

export async function listPurchases(walletAddress: string, limit = 50) {
  const supabase = referralDb();
  const { data, error } = await supabase
    .from(referralTables.purchases)
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(readReferralDbError(error, "Failed to load purchases."));
  }

  return (data ?? []) as SwiftPointsPurchaseRecord[];
}
