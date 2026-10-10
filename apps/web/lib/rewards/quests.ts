// Server-only. Quests (campaigns): rules checked after each rewarded payment,
// points paid once per wallet per quest (Rewards v2, REWARDS-PLAN.md).
import { recordLedgerEntry } from "@/lib/referral/ledger-service";
import { referralDb } from "@/lib/referral/db";

/** What a wallet has to do. "manual" quests are awarded by an admin. */
export type QuestRule =
  | { type: "payments"; count: number }
  | { type: "volume"; usd: number }
  | { type: "streak"; days: number }
  | { type: "manual" };

export type QuestRow = {
  active: boolean;
  description: string;
  ends_at: string | null;
  id: string;
  points: number;
  rule: unknown;
  slug: string;
  starts_at: string;
  title: string;
};

export type QuestProgress = { current: number; target: number; unit: string };

/** A stored rule, checked: anything unknown counts as manual. */
export function readQuestRule(value: unknown): QuestRule {
  const rule = (value ?? {}) as Record<string, unknown>;
  const positive = (key: string) => {
    const number = Number(rule[key]);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  if (rule.type === "payments" && positive("count")) return { count: Math.floor(positive("count")!), type: "payments" };
  if (rule.type === "volume" && positive("usd")) return { type: "volume", usd: positive("usd")! };
  if (rule.type === "streak" && positive("days")) return { days: Math.floor(positive("days")!), type: "streak" };
  return { type: "manual" };
}

/** "Make 3 payments", for the admin list and the page. */
export function describeQuestRule(rule: QuestRule) {
  switch (rule.type) {
    case "payments":
      return `Make ${rule.count} payment${rule.count === 1 ? "" : "s"}`;
    case "volume":
      return `Pay $${rule.usd.toLocaleString()} in total`;
    case "streak":
      return `Reach a ${rule.days}-day streak`;
    default:
      return "Awarded by SaphraONE";
  }
}

function isLive(quest: QuestRow, now = Date.now()) {
  return (
    quest.active &&
    new Date(quest.starts_at).getTime() <= now &&
    (!quest.ends_at || new Date(quest.ends_at).getTime() > now)
  );
}

/** How far a wallet is on each quest (payments and volume count only inside the quest's dates). */
export async function questProgress(walletAddress: string, quests: QuestRow[]) {
  const wallet = walletAddress.toLowerCase();
  const db = referralDb();
  const needsEvents = quests.some((quest) => {
    const rule = readQuestRule(quest.rule);
    return rule.type === "payments" || rule.type === "volume";
  });
  const earliest = quests.reduce(
    (min, quest) => (quest.starts_at < min ? quest.starts_at : min),
    new Date().toISOString(),
  );
  const [events, streak] = await Promise.all([
    needsEvents
      ? db
          .from("rewards_cashback_events")
          .select("volume_usd,created_at")
          .eq("wallet_address", wallet)
          .gte("created_at", earliest)
      : Promise.resolve({ data: [] as Array<{ created_at: string; volume_usd: number }> }),
    db.from("rewards_streaks").select("current_streak,last_day").eq("wallet_address", wallet).maybeSingle(),
  ]);
  const rows = (events.data ?? []) as Array<{ created_at: string; volume_usd: number }>;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const lastDay = (streak.data as { last_day?: string | null } | null)?.last_day ?? null;
  const currentStreak =
    lastDay === today || lastDay === yesterday
      ? Number((streak.data as { current_streak?: number } | null)?.current_streak ?? 0)
      : 0;

  const progress = new Map<string, QuestProgress | null>();
  for (const quest of quests) {
    const rule = readQuestRule(quest.rule);
    const inWindow = rows.filter(
      (row) => row.created_at >= quest.starts_at && (!quest.ends_at || row.created_at < quest.ends_at),
    );
    if (rule.type === "payments") {
      progress.set(quest.id, { current: inWindow.length, target: rule.count, unit: "payments" });
    } else if (rule.type === "volume") {
      const volume = inWindow.reduce((sum, row) => sum + Number(row.volume_usd), 0);
      progress.set(quest.id, { current: Math.floor(volume * 100) / 100, target: rule.usd, unit: "USD" });
    } else if (rule.type === "streak") {
      progress.set(quest.id, { current: currentStreak, target: rule.days, unit: "days" });
    } else {
      progress.set(quest.id, null);
    }
  }
  return progress;
}

/**
 * Pay a quest's points to a wallet, once. The completion row's primary key
 * (quest, wallet) and the ledger's idempotency key both stop a second award.
 * Returns false when the wallet already had it.
 */
export async function awardQuest(input: { awardedBy?: string; quest: QuestRow; walletAddress: string }) {
  const wallet = input.walletAddress.toLowerCase();
  const db = referralDb();
  const { error } = await db.from("rewards_quest_completions").insert({ quest_id: input.quest.id, wallet_address: wallet });
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  const { entry } = await recordLedgerEntry({
    campaignId: input.quest.id,
    createdBy: input.awardedBy ?? "system",
    description: `Quest: ${input.quest.title}`,
    entryType: "QUEST_REWARD",
    idempotencyKey: `quest_${input.quest.id}_${wallet}`,
    metadata: { questId: input.quest.id, slug: input.quest.slug, source: "rewards_v2_quest" },
    points: Number(input.quest.points),
    walletAddress: wallet,
  });
  await db
    .from("rewards_quest_completions")
    .update({ ledger_entry_id: entry.id })
    .eq("quest_id", input.quest.id)
    .eq("wallet_address", wallet);
  return true;
}

/** After a rewarded payment: award every live, automatic quest the wallet just completed. */
export async function checkQuestsForWallet(walletAddress: string) {
  const wallet = walletAddress.toLowerCase();
  const db = referralDb();
  const [quests, done] = await Promise.all([
    db.from("rewards_quests").select("*").eq("active", true),
    db.from("rewards_quest_completions").select("quest_id").eq("wallet_address", wallet),
  ]);
  const completed = new Set(((done.data ?? []) as Array<{ quest_id: string }>).map((row) => row.quest_id));
  const open = ((quests.data ?? []) as QuestRow[]).filter(
    (quest) => isLive(quest) && !completed.has(quest.id) && readQuestRule(quest.rule).type !== "manual",
  );
  if (open.length === 0) return [];

  const progress = await questProgress(wallet, open);
  const awarded: string[] = [];
  for (const quest of open) {
    const state = progress.get(quest.id);
    if (state && state.current >= state.target && (await awardQuest({ quest, walletAddress: wallet }))) {
      awarded.push(quest.id);
    }
  }
  return awarded;
}
