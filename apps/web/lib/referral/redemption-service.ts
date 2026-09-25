import { referralDb, referralTables, readReferralDbError } from "@/lib/referral/db";
import {
  getSwiftPointsSummary,
  pointsToInternalUnits,
  recordLedgerEntry,
} from "@/lib/referral/ledger-service";
import type { SwiftPointsRedemptionRecord } from "@/lib/referral/types";
import { payUsdcFromTreasury } from "@/lib/referral/treasury";
import {
  MINIMUM_REDEMPTION_SWIFTPOINTS,
  MINIMUM_REDEMPTION_UNITS,
  SWIFTPOINTS_USD_PER_POINT,
} from "@/lib/referral/types";

/**
 * Request redemption of SwiftPoints to on-chain USDC.
 * Enforces minimum 100 SwiftPoints ($1.00 USDC).
 */
/**
 * Undo a redemption's debit when the payout could not be made.
 *
 * Without this a failed transfer would burn the points and deliver nothing.
 * Keyed on the original entry, so a retry cannot refund twice.
 */
async function refundRedemptionDebit(input: {
  ledgerEntryId: string;
  points: number;
  reason: string;
  walletAddress: string;
}) {
  await recordLedgerEntry({
    description: `Refunded ${input.points} SwiftPoints: ${input.reason}`,
    entryType: "REVERSAL",
    idempotencyKey: `redemption-reversal:${input.ledgerEntryId}`,
    originalLedgerEntryId: input.ledgerEntryId,
    points: input.points,
    walletAddress: input.walletAddress,
  });
}

export async function redeemSwiftPoints(input: {
  walletAddress: string;
  points: number;
  destinationWallet?: string;
  idempotencyKey?: string;
}): Promise<SwiftPointsRedemptionRecord> {
  const wallet = input.walletAddress.toLowerCase();
  const destination = (input.destinationWallet ?? wallet).toLowerCase();

  // 1. Enforce minimum 100 SwiftPoints
  if (input.points < MINIMUM_REDEMPTION_SWIFTPOINTS) {
    throw new Error(
      `Minimum redemption is ${MINIMUM_REDEMPTION_SWIFTPOINTS} SwiftPoints (1 USDC).`,
    );
  }

  // 2. Validate available balance
  const summary = await getSwiftPointsSummary(wallet);
  if (summary.available < input.points) {
    throw new Error(
      `Insufficient points. You have ${summary.available} SwiftPoints available, but tried to redeem ${input.points}.`,
    );
  }

  const amountUnits = pointsToInternalUnits(input.points);
  const usdcAmount = Number((input.points * SWIFTPOINTS_USD_PER_POINT).toFixed(2));
  const idempotencyKey = input.idempotencyKey ?? `redemption:${wallet}:${Date.now()}`;
  const supabase = referralDb();

  // 3. Insert Redemption record
  const redemptionInsert = await supabase
    .from(referralTables.redemptions)
    .insert({
      wallet_address: wallet,
      points_redeemed: input.points,
      amount_units: Number(amountUnits),
      usdc_amount: usdcAmount,
      destination_wallet: destination,
      status: "PROCESSING",
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();

  if (redemptionInsert.error) {
    if (redemptionInsert.error.code === "23505") {
      const existing = await supabase
        .from(referralTables.redemptions)
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .single();
      return existing.data as SwiftPointsRedemptionRecord;
    }
    throw new Error(readReferralDbError(redemptionInsert.error, "Could not create redemption request."));
  }

  const redemption = redemptionInsert.data as SwiftPointsRedemptionRecord;

  let debitEntryId: string | null = null;

  try {
    // 4. Record ledger debit (-points)
    const ledgerResult = await recordLedgerEntry({
      walletAddress: wallet,
      entryType: "REDEMPTION",
      points: -input.points,
      idempotencyKey: `redemption:${redemption.id}:debit`,
      description: `Redeemed ${input.points} SwiftPoints for ${usdcAmount} USDC`,
      metadata: {
        redemptionId: redemption.id,
        destinationWallet: destination,
        usdcAmount,
      },
    });

    debitEntryId = ledgerResult.entry.id;

    // 5. Pay the USDC out. Points are already debited, so a failure here must
    //    reverse them — see the catch below.
    const txHash = await payUsdcFromTreasury({
      to: destination,
      usdcAmount,
    });

    // 6. Mark completed, recording the transfer that actually paid it.
    const updated = await supabase
      .from(referralTables.redemptions)
      .update({
        status: "COMPLETED",
        ledger_entry_id: ledgerResult.entry.id,
        tx_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", redemption.id)
      .select("*")
      .single();

    return updated.data as SwiftPointsRedemptionRecord;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Redemption failed";

    // Give the points back before reporting the failure, so a failed payout
    // never costs the holder anything.
    if (debitEntryId) {
      try {
        await refundRedemptionDebit({
          ledgerEntryId: debitEntryId,
          points: input.points,
          reason,
          walletAddress: wallet,
        });
      } catch {
        // The reversal is idempotent and can be replayed; surface the original
        // failure rather than masking it with a refund error.
      }
    }

    await supabase
      .from(referralTables.redemptions)
      .update({
        status: "FAILED",
        error_message: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", redemption.id);

    throw error;
  }
}

/**
 * List redemptions for a user.
 */
export async function listUserRedemptions(walletAddress: string) {
  const wallet = walletAddress.toLowerCase();
  const supabase = referralDb();

  const { data, error } = await supabase
    .from(referralTables.redemptions)
    .select("*")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(readReferralDbError(error, "Could not load redemptions."));
  }

  return (data ?? []) as SwiftPointsRedemptionRecord[];
}
