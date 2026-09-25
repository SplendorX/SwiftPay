import { randomUUID } from "node:crypto";

import { readReferralDbError, referralDb, referralTables } from "@/lib/referral/db";
import {
  getSwiftPointsSummary,
  recordLedgerEntry,
} from "@/lib/referral/ledger-service";
import type { SwiftPointsGiftRecord } from "@/lib/referral/types";

/** Smallest gift. Below this the ledger noise outweighs the value moved. */
export const MINIMUM_GIFT_POINTS = 10;

/**
 * Move SwiftPoints from one wallet to another.
 *
 * Two ledger entries, debit then credit, sharing one idempotency root so a
 * retry cannot double-spend the sender or double-credit the recipient. The
 * debit goes first: if the credit fails, the sender is short and we can
 * reconcile from the gift row, which is recoverable — the reverse would mint
 * points out of nothing.
 */
export async function giftSwiftPoints(input: {
  idempotencyKey?: string;
  note?: string;
  points: number;
  recipientWallet: string;
  senderWallet: string;
}): Promise<SwiftPointsGiftRecord> {
  const sender = input.senderWallet.toLowerCase();
  const recipient = input.recipientWallet.toLowerCase();
  const points = Math.floor(input.points);

  if (!Number.isFinite(points) || points < MINIMUM_GIFT_POINTS) {
    throw new Error(`The smallest gift is ${MINIMUM_GIFT_POINTS} SwiftPoints.`);
  }

  if (sender === recipient) {
    throw new Error("You cannot gift SwiftPoints to yourself.");
  }

  const supabase = referralDb();

  // The recipient must already exist: points reference a profile, and
  // crediting an unknown wallet would strand them.
  const recipientProfile = await supabase
    .from(referralTables.userProfiles)
    .select("wallet_address")
    .eq("wallet_address", recipient)
    .maybeSingle();

  if (recipientProfile.error) {
    throw new Error(
      readReferralDbError(recipientProfile.error, "Failed to look up the recipient."),
    );
  }

  if (!recipientProfile.data) {
    throw new Error(
      "That wallet does not have a SwiftPay profile yet, so it cannot receive points.",
    );
  }

  const summary = await getSwiftPointsSummary(sender);
  if (summary.available < points) {
    throw new Error(
      `You have ${summary.available} SwiftPoints available, but tried to gift ${points}.`,
    );
  }

  const root = input.idempotencyKey ?? randomUUID();
  const note = input.note?.trim().slice(0, 200) || null;

  const existing = await supabase
    .from(referralTables.gifts)
    .select("*")
    .eq("idempotency_key", root)
    .maybeSingle();

  if (existing.data) {
    return existing.data as SwiftPointsGiftRecord;
  }

  const debit = await recordLedgerEntry({
    description: `Gifted ${points} SwiftPoints`,
    entryType: "GIFT_SENT",
    idempotencyKey: `gift:${root}:sent`,
    metadata: { note, recipient },
    points: -points,
    walletAddress: sender,
  });

  const credit = await recordLedgerEntry({
    description: `Received ${points} SwiftPoints`,
    entryType: "GIFT_RECEIVED",
    idempotencyKey: `gift:${root}:received`,
    metadata: { note, sender },
    points,
    walletAddress: recipient,
  });

  const inserted = await supabase
    .from(referralTables.gifts)
    .insert({
      idempotency_key: root,
      note,
      points,
      recipient_ledger_entry_id: credit.entry.id,
      recipient_wallet: recipient,
      sender_ledger_entry_id: debit.entry.id,
      sender_wallet: sender,
    })
    .select("*")
    .single();

  if (inserted.error) {
    throw new Error(
      readReferralDbError(inserted.error, "The points moved but the gift record failed."),
    );
  }

  return inserted.data as SwiftPointsGiftRecord;
}

export async function listGifts(walletAddress: string, limit = 50) {
  const wallet = walletAddress.toLowerCase();
  const supabase = referralDb();
  const { data, error } = await supabase
    .from(referralTables.gifts)
    .select("*")
    .or(`sender_wallet.eq.${wallet},recipient_wallet.eq.${wallet}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(readReferralDbError(error, "Failed to load gifts."));
  }

  return (data ?? []) as SwiftPointsGiftRecord[];
}
