// Server-only. The admin rewards screen: review queues and quests.
import { recordLedgerEntry } from "@/lib/referral/ledger-service";
import { referralDb } from "@/lib/referral/db";
import { payUsdcFromTreasury, TreasuryError } from "@/lib/referral/treasury";
import { premiumProductLabels, type PremiumProduct } from "@/lib/rewards/premium";
import { awardQuest, describeQuestRule, readQuestRule, type QuestRow } from "@/lib/rewards/quests";

/** A payout with no answer after this long is shown as stuck. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

export class AdminRewardsError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AdminRewardsError";
  }
}

async function audit(action: string, targetType: string, targetId: string, reason: string, changes: object = {}) {
  await referralDb()
    .from("referral_audit_logs")
    .insert({ action, admin_id: "admin", changes, reason: reason || "—", target_id: targetId, target_type: targetType });
}

function stuck(row: { created_at: string; last_error: string | null }) {
  return Boolean(row.last_error) || Date.now() - new Date(row.created_at).getTime() > STUCK_AFTER_MS;
}

/** Everything waiting on a person, plus the quests. */
export async function loadAdminRewards() {
  const db = referralDb();
  const [held, claims, discounts, quests, completions] = await Promise.all([
    db
      .from("referral_fee_earnings")
      .select("id,referrer_wallet,referred_wallet,tx_hash,fee_usd,amount_usdc,tier,source,created_at")
      .eq("status", "HELD")
      .order("created_at", { ascending: true })
      .limit(200),
    db
      .from("referral_usdc_claims")
      .select("id,referrer_wallet,amount_usdc,status,payout_tx_hash,last_error,created_at")
      .in("status", ["REVIEW", "PENDING"])
      .order("created_at", { ascending: true })
      .limit(200),
    db
      .from("rewards_discount_claims")
      .select("id,wallet_address,refund_usdc,refund_percent,points_spent,status,last_error,created_at,purchase_id,premium_purchases(product,amount_usdc)")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(200),
    db.from("rewards_quests").select("*").order("created_at", { ascending: false }),
    db.from("rewards_quest_completions").select("quest_id"),
  ]);

  const completionCounts = new Map<string, number>();
  for (const row of (completions.data ?? []) as Array<{ quest_id: string }>) {
    completionCounts.set(row.quest_id, (completionCounts.get(row.quest_id) ?? 0) + 1);
  }

  type ClaimRow = {
    amount_usdc: number;
    created_at: string;
    id: string;
    last_error: string | null;
    payout_tx_hash: string | null;
    referrer_wallet: string;
    status: string;
  };
  type DiscountRow = {
    created_at: string;
    id: string;
    last_error: string | null;
    points_spent: number;
    premium_purchases: { amount_usdc: number; product: PremiumProduct } | null;
    refund_percent: number;
    refund_usdc: number;
    wallet_address: string;
  };

  return {
    claims: ((claims.data ?? []) as ClaimRow[])
      .filter((row) => row.status === "REVIEW" || stuck(row))
      .map((row) => ({
        amountUsdc: Number(row.amount_usdc),
        createdAt: row.created_at,
        id: row.id,
        lastError: row.last_error,
        // REVIEW: over the automatic cap. PENDING: the payout's outcome is unknown.
        kind: row.status === "REVIEW" ? ("review" as const) : ("stuck" as const),
        wallet: row.referrer_wallet,
      })),
    discounts: ((discounts.data ?? []) as unknown as DiscountRow[]).filter(stuck).map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      lastError: row.last_error,
      pointsSpent: Number(row.points_spent),
      product: row.premium_purchases ? premiumProductLabels[row.premium_purchases.product] : "Premium purchase",
      refundPercent: row.refund_percent,
      refundUsdc: Number(row.refund_usdc),
      wallet: row.wallet_address,
    })),
    held: ((held.data ?? []) as Array<{
      amount_usdc: number;
      created_at: string;
      fee_usd: number;
      id: string;
      referred_wallet: string;
      referrer_wallet: string;
      source: string;
      tier: string;
      tx_hash: string;
    }>).map((row) => ({
      amountUsdc: Number(row.amount_usdc),
      createdAt: row.created_at,
      feeUsd: Number(row.fee_usd),
      id: row.id,
      referred: row.referred_wallet,
      referrer: row.referrer_wallet,
      source: row.source,
      tier: row.tier,
      txHash: row.tx_hash,
    })),
    quests: ((quests.data ?? []) as QuestRow[]).map((quest) => ({
      active: quest.active,
      completions: completionCounts.get(quest.id) ?? 0,
      description: quest.description,
      endsAt: quest.ends_at,
      id: quest.id,
      points: Number(quest.points),
      rule: readQuestRule(quest.rule),
      ruleText: describeQuestRule(readQuestRule(quest.rule)),
      slug: quest.slug,
      startsAt: quest.starts_at,
      title: quest.title,
    })),
  };
}

function requireReason(reason: unknown) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < 3) throw new AdminRewardsError("Give a short reason.");
  return text.slice(0, 500);
}

function requireHash(value: unknown) {
  const hash = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new AdminRewardsError("Enter the payout transaction hash (0x…).");
  return hash;
}

/** Move one row from `from` to `to`; only one admin action can win the move. */
async function moveStatus(table: string, id: string, from: string[], patch: Record<string, unknown>) {
  const { data, error } = await referralDb()
    .from(table)
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AdminRewardsError("Someone already handled this, or it changed. Refresh.", 409);
  return data as Record<string, unknown>;
}

// ── Held referral earnings ──────────────────────────────────────────────────

export async function releaseEarning(id: string, reason: string) {
  await moveStatus("referral_fee_earnings", id, ["HELD"], { status: "ACCRUED" });
  await audit("release_earning", "referral_fee_earning", id, reason);
}

export async function rejectEarning(id: string, reason: unknown) {
  const why = requireReason(reason);
  await moveStatus("referral_fee_earnings", id, ["HELD"], { status: "REVERSED" });
  await audit("reject_earning", "referral_fee_earning", id, why);
}

// ── Referral claims ─────────────────────────────────────────────────────────

/** Pay a claim held for being over the automatic cap. */
export async function payReviewedClaim(id: string, reason: string) {
  // REVIEW → PENDING first: a second click finds nothing to move.
  const claim = await moveStatus("referral_usdc_claims", id, ["REVIEW"], {
    last_error: null,
    status: "PENDING",
    updated_at: new Date().toISOString(),
  });
  const amount = Number(claim.amount_usdc);
  const wallet = String(claim.referrer_wallet);
  try {
    const txHash = await payUsdcFromTreasury({ adminApproved: true, to: wallet, usdcAmount: amount });
    await referralDb()
      .from("referral_usdc_claims")
      .update({ payout_tx_hash: txHash, status: "PAID", updated_at: new Date().toISOString() })
      .eq("id", id);
    await audit("pay_claim", "referral_usdc_claim", id, reason, { amountUsdc: amount, txHash });
    return { txHash };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The payout failed.";
    // Nothing sent: back to review. Unknown: stays PENDING (shown as stuck).
    await referralDb()
      .from("referral_usdc_claims")
      .update({
        last_error: message,
        status: cause instanceof TreasuryError ? "REVIEW" : "PENDING",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    throw new AdminRewardsError(message, 502);
  }
}

/** Not paid: the earnings go back to the referrer to claim again. */
export async function returnClaim(id: string, reason: unknown) {
  const why = requireReason(reason);
  await moveStatus("referral_usdc_claims", id, ["REVIEW", "PENDING"], {
    last_error: `Returned by admin: ${why}`,
    status: "FAILED",
    updated_at: new Date().toISOString(),
  });
  await referralDb().from("referral_fee_earnings").update({ claim_id: null, status: "ACCRUED" }).eq("claim_id", id);
  await audit("return_claim", "referral_usdc_claim", id, why);
}

/** Fraud: the claim is refused and its earnings are reversed. */
export async function rejectClaim(id: string, reason: unknown) {
  const why = requireReason(reason);
  await moveStatus("referral_usdc_claims", id, ["REVIEW", "PENDING"], {
    last_error: `Rejected by admin: ${why}`,
    status: "FAILED",
    updated_at: new Date().toISOString(),
  });
  await referralDb().from("referral_fee_earnings").update({ status: "REVERSED" }).eq("claim_id", id);
  await audit("reject_claim", "referral_usdc_claim", id, why);
}

/** A stuck payout that did go out (checked on the explorer). */
export async function markClaimPaid(id: string, txHash: unknown, reason: string) {
  const hash = requireHash(txHash);
  await moveStatus("referral_usdc_claims", id, ["PENDING"], {
    last_error: null,
    payout_tx_hash: hash,
    status: "PAID",
    updated_at: new Date().toISOString(),
  });
  await audit("mark_claim_paid", "referral_usdc_claim", id, reason, { txHash: hash });
}

// ── Discount claims ─────────────────────────────────────────────────────────

/** A stuck refund that did go out (checked on the explorer). */
export async function markDiscountPaid(id: string, txHash: unknown, reason: string) {
  const hash = requireHash(txHash);
  await moveStatus("rewards_discount_claims", id, ["PENDING"], {
    last_error: null,
    payout_tx_hash: hash,
    status: "PAID",
    updated_at: new Date().toISOString(),
  });
  await audit("mark_discount_paid", "rewards_discount_claim", id, reason, { txHash: hash });
}

/** A stuck refund that never went out: the points go back. */
export async function failDiscount(id: string, reason: unknown) {
  const why = requireReason(reason);
  const claim = await moveStatus("rewards_discount_claims", id, ["PENDING"], {
    last_error: `Failed by admin: ${why}`,
    status: "FAILED",
    updated_at: new Date().toISOString(),
  });
  await recordLedgerEntry({
    createdBy: "admin",
    description: "Discount refund failed; points returned",
    entryType: "REVERSAL",
    idempotencyKey: `discount_${id}_reversal`,
    metadata: { claimId: id, reason: why },
    originalLedgerEntryId: (claim.ledger_entry_id as string | null) ?? null,
    points: Number(claim.points_spent),
    walletAddress: String(claim.wallet_address),
  });
  await audit("fail_discount", "rewards_discount_claim", id, why);
}

// ── Quests ──────────────────────────────────────────────────────────────────

function questFields(input: Record<string, unknown>) {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  if (!title) throw new AdminRewardsError("A quest needs a title.");
  const points = Number(input.points);
  if (!Number.isFinite(points) || points <= 0 || points > 100_000) {
    throw new AdminRewardsError("Points must be between 0 and 100,000.");
  }
  const date = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) throw new AdminRewardsError("A date isn't valid.");
    return parsed.toISOString();
  };
  const startsAt = date(input.startsAt) ?? new Date().toISOString();
  const endsAt = date(input.endsAt);
  if (endsAt && endsAt <= startsAt) throw new AdminRewardsError("The end has to be after the start.");
  return {
    active: input.active !== false,
    description: typeof input.description === "string" ? input.description.trim().slice(0, 300) : "",
    ends_at: endsAt,
    points,
    rule: readQuestRule(input.rule),
    starts_at: startsAt,
    title,
  };
}

export async function createQuest(input: Record<string, unknown>) {
  const fields = questFields(input);
  const slug =
    `${fields.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "quest"}-${Date.now().toString(36)}`;
  const { data, error } = await referralDb().from("rewards_quests").insert({ ...fields, slug }).select("id").single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  await audit("create_quest", "rewards_quest", id, "Created", fields);
  return { id };
}

export async function updateQuest(id: string, input: Record<string, unknown>) {
  const fields = questFields(input);
  const { error } = await referralDb().from("rewards_quests").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
  await audit("update_quest", "rewards_quest", id, "Updated", fields);
}

export async function setQuestActive(id: string, active: boolean) {
  const { error } = await referralDb().from("rewards_quests").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(active ? "activate_quest" : "pause_quest", "rewards_quest", id, active ? "Activated" : "Paused");
}

/** Award a quest by hand (for "manual" quests, or a support fix). */
export async function awardQuestToWallet(questId: string, walletAddress: unknown, reason: unknown) {
  const why = requireReason(reason);
  const wallet = typeof walletAddress === "string" ? walletAddress.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new AdminRewardsError("Enter the wallet address (0x…).");
  const { data, error } = await referralDb().from("rewards_quests").select("*").eq("id", questId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AdminRewardsError("Quest not found.", 404);
  const awarded = await awardQuest({ awardedBy: "admin", quest: data as QuestRow, walletAddress: wallet });
  if (!awarded) throw new AdminRewardsError("That wallet already has this quest.", 409);
  await audit("award_quest", "rewards_quest", questId, why, { wallet });
}
