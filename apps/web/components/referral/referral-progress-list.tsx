"use client";

import { Briefcase, Check, CheckCircle2, Clock, ShieldAlert, User } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { getReferralRewardPolicy } from "@/lib/referral/policy-service";
import type { ReferralDashboardData, ReferralTier } from "@/lib/referral/types";
import { cn } from "@/lib/utils";

type ReferralActivity = ReferralDashboardData["activity"][number];

type Stage = "joined" | "paying" | "qualified" | "held";

function stageOf(ref: ReferralActivity): Stage {
  if (ref.status === "QUALIFIED" || ref.status === "REWARDED") return "qualified";
  if (ref.status === "FRAUD_REVIEW" || ref.status === "REJECTED" || ref.status === "REVERSED") {
    return "held";
  }
  return ref.progress.qualifyingVolume > 0 ? "paying" : "joined";
}

const stagePill: Record<Stage, { label: string; className: string }> = {
  joined: { label: "No payments yet", className: "bg-muted text-muted-foreground" },
  paying: {
    label: "In progress",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  qualified: {
    label: "Qualified",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  held: { label: "Under review", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
};

const usd = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function percent(current: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function syncedAgo(iso: string | null) {
  if (!iso) return null;
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Synced ${hours} h ago` : `Synced ${new Date(iso).toLocaleDateString()}`;
}

function Stepper({ stage }: { stage: Stage }) {
  const steps = ["Joined", "Making payments", "Qualified"];
  const reached = stage === "qualified" ? 3 : stage === "paying" ? 2 : 1;

  return (
    <ol className="flex items-center gap-1.5" aria-label="Qualification steps">
      {steps.map((label, index) => {
        const done = index < reached;
        return (
          <li key={label} className="flex items-center gap-1.5 min-w-0">
            {index > 0 && (
              <span
                aria-hidden
                className={cn("h-px w-4 sm:w-8 shrink-0", done ? "bg-emerald-500" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                done
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-border bg-background",
              )}
            >
              {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            <span
              className={cn(
                "text-[11px] truncate",
                done ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Meter({
  label,
  current,
  target,
  format,
}: {
  label: string;
  current: number;
  target: number;
  format: (value: number) => string;
}) {
  const value = percent(current, target);
  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground truncate">{label}</span>
        <span className="font-mono font-semibold text-foreground whitespace-nowrap">
          {format(current)} <span className="text-muted-foreground font-normal">/ {format(target)}</span>
        </span>
      </div>
      <Progress
        value={value}
        className="h-1.5"
        aria-label={`${label}: ${value}%`}
      />
    </div>
  );
}

function ReferralProgressRow({ referral, tier }: { referral: ReferralActivity; tier: ReferralTier }) {
  const stage = stageOf(referral);
  const pill = stagePill[stage];
  const p = referral.progress;
  const isPersonal = referral.accountType === "PERSONAL";
  const potentialReward = getReferralRewardPolicy(tier, referral.accountType).referrerDirectRewardPoints;
  const synced = syncedAgo(p.lastSyncedAt);

  return (
    <li className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              isPersonal
                ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                : "bg-purple-500/10 text-purple-700 dark:text-purple-300",
            )}
          >
            {isPersonal ? <User className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="font-mono text-sm font-semibold text-foreground truncate">
              {referral.referredUserOrBusiness}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isPersonal ? "Personal" : "Business"} · joined{" "}
              {new Date(referral.joinedDate).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              pill.className,
            )}
          >
            {stage === "qualified" && <CheckCircle2 className="h-3 w-3" />}
            {stage === "held" && <ShieldAlert className="h-3 w-3" />}
            {pill.label}
          </span>
          {stage === "qualified" ? (
            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
              +{referral.rewardEarnedPoints} pts
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">+{potentialReward} pts</span>
          )}
        </div>
      </div>

      <Stepper stage={stage} />

      {stage === "qualified" ? (
        <p className="text-xs text-muted-foreground">
          Qualified
          {referral.qualifiedDate ? ` on ${new Date(referral.qualifiedDate).toLocaleDateString()}` : ""}
          {" "}— you now earn activity cashback on their payments.
        </p>
      ) : stage === "held" ? (
        <p className="text-xs text-muted-foreground">
          This referral is being reviewed and isn&apos;t progressing right now.
        </p>
      ) : (
        <div className="rounded-lg bg-muted/40 p-3 space-y-2.5">
          <Meter
            label={`Payment volume · ${p.paymentCount} payment${p.paymentCount === 1 ? "" : "s"}`}
            current={p.qualifyingVolume}
            target={p.targetVolume}
            format={usd}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
            <span className="text-foreground">
              {usd(Math.max(0, p.targetVolume - p.qualifyingVolume))} more in payments to qualify
            </span>
            {synced && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {synced}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** Closest to qualifying first; qualified and held invites sink to the end. */
function sortByProgress(referrals: ReferralActivity[]) {
  const rank = (ref: ReferralActivity) => {
    const stage = stageOf(ref);
    if (stage === "qualified") return -1;
    if (stage === "held") return -2;
    return percent(ref.progress.qualifyingVolume, ref.progress.targetVolume);
  };
  return [...referrals].sort((left, right) => rank(right) - rank(left));
}

export function ReferralProgressList({
  referrals,
  tier,
}: {
  referrals: ReferralDashboardData["activity"];
  tier: ReferralTier;
}) {
  const qualified = referrals.filter((ref) => stageOf(ref) === "qualified").length;
  const inProgress = referrals.length - qualified;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          <strong className="text-foreground">{inProgress}</strong> in progress ·{" "}
          <strong className="text-foreground">{qualified}</strong> qualified
        </span>
        <span>Closest to qualifying first</span>
      </div>
      {/* Own scroll area so a long invite list never stretches the page. */}
      <ul
        className="max-h-[32rem] overflow-y-auto overscroll-contain divide-y divide-border/60"
        tabIndex={0}
        aria-label="Invited referrals"
      >
        {sortByProgress(referrals).map((referral) => (
          <ReferralProgressRow key={referral.id} referral={referral} tier={tier} />
        ))}
      </ul>
    </div>
  );
}
