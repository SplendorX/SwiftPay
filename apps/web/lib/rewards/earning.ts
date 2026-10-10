// Server-only. Rewards v2 earning: monthly cashback tiers and streaks.
import { recordLedgerEntry } from "@/lib/referral/ledger-service";
import { referralDb } from "@/lib/referral/db";
import { checkQuestsForWallet } from "@/lib/rewards/quests";
import {
  CASHBACK_TIERS,
  MONTHLY_CASHBACK_CAP_POINTS,
  STREAK_MILESTONES,
  USD_PER_POINT,
  streakPointsForDay,
} from "@/lib/rewards/config";

function utcDay(at = new Date()) {
  return at.toISOString().slice(0, 10);
}

export type CashbackAward = {
  points: number;
  streak: { cycleDay: number; current: number; newDay: boolean; points: number } | null;
};

/**
 * Credit one eligible transaction: tiered cashback (monthly tiers and the $5
 * cap applied atomically in the database), then today's streak day. Safe to
 * call again for the same transaction: nothing is counted or paid twice.
 *
 * `feeUsd`, when known, caps the cashback at the fee's value, so moving money
 * between one's own wallets never earns.
 */
export async function awardTransactionRewards(input: {
  description: string;
  feeUsd?: number;
  metadata?: Record<string, unknown>;
  txKey: string;
  volumeUsd: number;
  walletAddress: string;
}): Promise<CashbackAward> {
  const wallet = input.walletAddress.toLowerCase();
  if (!Number.isFinite(input.volumeUsd) || input.volumeUsd <= 0) {
    return { points: 0, streak: null };
  }
  const feeCapPoints =
    input.feeUsd === undefined
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, Math.floor((input.feeUsd / USD_PER_POINT) * 100) / 100);

  const [tier1, tier2] = CASHBACK_TIERS;
  const { data, error } = await referralDb().rpc("rewards_award_cashback", {
    p_fee_cap_points: feeCapPoints,
    p_monthly_cap: MONTHLY_CASHBACK_CAP_POINTS,
    p_tier1_limit: tier1.limitUsd,
    p_tier1_rate: tier1.pointsPer10Usd / 10,
    p_tier2_limit: tier2.limitUsd,
    p_tier2_rate: tier2.pointsPer10Usd / 10,
    p_tx_key: input.txKey,
    p_volume_usd: input.volumeUsd,
    p_wallet: wallet,
  });
  if (error) throw new Error(`Cashback could not be calculated: ${error.message}`);
  const points = Number(data ?? 0);

  if (points > 0) {
    await recordLedgerEntry({
      description: input.description,
      entryType: "TRANSACTION_CASHBACK",
      idempotencyKey: `rewards_cashback_${input.txKey}`,
      metadata: { ...input.metadata, source: "rewards_v2_cashback", volumeUsd: input.volumeUsd },
      points,
      transactionId: input.txKey,
      walletAddress: wallet,
    });
  }

  const streak = await recordStreakDay(wallet).catch((cause) => {
    console.warn("[rewards] streak", cause instanceof Error ? cause.message : cause);
    return null;
  });
  // Quests count this payment (and today's streak) right away.
  await checkQuestsForWallet(wallet).catch((cause) => {
    console.warn("[rewards] quests", cause instanceof Error ? cause.message : cause);
  });
  return { points, streak };
}

/** Count today for the wallet's streak and pay its points (once per day). */
export async function recordStreakDay(walletAddress: string) {
  const wallet = walletAddress.toLowerCase();
  const day = utcDay();
  const { data, error } = await referralDb().rpc("rewards_record_day", { p_day: day, p_wallet: wallet });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { current_streak: number; cycle_day: number; new_day: boolean; total_days: number }
    | undefined;
  if (!row) return null;

  const points = row.new_day ? streakPointsForDay(row.cycle_day) : 0;
  if (points > 0) {
    const milestone = STREAK_MILESTONES.find((entry) => entry.days === row.cycle_day);
    await recordLedgerEntry({
      description: milestone
        ? `${milestone.days}-day streak bonus`
        : `Streak day ${row.current_streak}`,
      entryType: "STREAK_REWARD",
      idempotencyKey: `rewards_streak_${wallet}_${day}`,
      metadata: { cycleDay: row.cycle_day, day, source: "rewards_v2_streak", streak: row.current_streak },
      points,
      walletAddress: wallet,
    });
  }
  return { current: row.current_streak, cycleDay: row.cycle_day, newDay: row.new_day, points };
}
