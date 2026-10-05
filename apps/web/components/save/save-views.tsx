"use client";

import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Pause,
  Percent,
  Play,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { pocketProgress } from "@/components/save/format";
import { Button } from "@/components/ui/button";
import { formatLockRemaining, formatUnlockDate, getPocketLockState } from "@/lib/save/lock";
import { getPocketEmoji, type SavingsPocketRecord, type SpendSaveConfigRecord } from "@/lib/save/types";
import { cn } from "@/lib/utils";

const MASK = "••••••";

/** "$1,234.50" from a decimal string, without float rounding surprises. */
export function formatSaved(amount: string | null | undefined) {
  if (!amount) return "$0.00";
  const [whole, fraction = ""] = amount.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${(fraction + "00").slice(0, 2)}`;
}

// ── Hero ────────────────────────────────────────────────────────────────────

/** Flowing ribbons behind the balance: SwiftPay's purple, in motion. */
function HeroWaves() {
  return (
    <svg aria-hidden className="save-hero-waves" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 220">
      <defs>
        <linearGradient id="save-wave-a" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#3b1478" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="save-wave-b" x1="1" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#5b21b6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="save-wave-c" x1="0" x2="1" y1="1" y2="0">
          <stop offset="0%" stopColor="#1e1b6b" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4338ca" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path className="save-wave save-wave-1" d="M-40 40 C 60 -20, 120 140, 230 90 S 380 -10, 460 60 L 460 -40 L -40 -40 Z" fill="url(#save-wave-a)" />
      <path className="save-wave save-wave-2" d="M260 -20 C 300 60, 380 70, 440 40 L 440 -20 Z" fill="url(#save-wave-b)" />
      <path className="save-wave save-wave-3" d="M-30 230 C 40 150, 110 160, 170 120 S 260 40, 230 -30 L -30 -30 Z" fill="url(#save-wave-c)" />
      <path className="save-wave save-wave-2" d="M300 240 C 320 180, 380 150, 440 160 L 440 240 Z" fill="url(#save-wave-b)" />
    </svg>
  );
}

export function SaveHero({
  disabled,
  hidden,
  loading,
  monthSaved,
  onAddPocket,
  onToggleHidden,
  pocketCount,
  total,
}: {
  disabled: boolean;
  hidden: boolean;
  loading: boolean;
  monthSaved: string;
  onAddPocket: () => void;
  onToggleHidden: () => void;
  pocketCount: number;
  total: string;
}) {
  return (
    <section className="save-hero">
      <HeroWaves />
      <div className="save-hero-body">
        <p className="save-hero-label">Total savings · USDC</p>
        <div className="save-hero-amount-row">
          {loading ? (
            <span className="save-hero-skeleton" />
          ) : (
            <p className="save-hero-amount" aria-live="polite">
              {hidden ? MASK : formatSaved(total)}
            </p>
          )}
          <button
            aria-label={hidden ? "Show balances" : "Hide balances"}
            className="save-hero-eye"
            onClick={onToggleHidden}
            type="button"
          >
            {hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        <div className="save-hero-meta">
          {!loading && Number(monthSaved) > 0 ? (
            <span className="save-hero-chip">
              <Sparkles className="h-3.5 w-3.5" /> {hidden ? MASK : `+${formatSaved(monthSaved)}`} this month
            </span>
          ) : null}
          <span className="save-hero-chip is-quiet">
            {pocketCount} {pocketCount === 1 ? "pocket" : "pockets"}
          </span>
        </div>
        <button className="save-hero-add" disabled={disabled} onClick={onAddPocket} type="button">
          <span className="save-hero-add-icon">
            <Plus className="h-4 w-4" />
          </span>
          Add pocket
        </button>
      </div>
    </section>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

/** A wallet with notes fanned out and a piggy bank on guard, in brand colours. */
function PocketsArt() {
  return (
    <svg aria-hidden className="save-pockets-art" viewBox="0 0 320 210">
      <g className="save-art-notes">
        <rect fill="#d9ccff" height="96" rx="8" transform="rotate(-38 210 92)" width="70" x="175" y="40" />
        <rect fill="#a78bfa" height="96" rx="8" transform="rotate(-24 222 96)" width="70" x="187" y="44" />
        <rect fill="#c4b5fd" height="96" rx="8" transform="rotate(-10 234 100)" width="70" x="199" y="48" />
      </g>
      <rect fill="#5b21b6" height="102" rx="10" width="230" x="78" y="94" />
      <rect fill="#6d28d9" height="18" rx="6" width="230" x="78" y="94" />
      <rect fill="#c4b5fd" height="62" rx="3" width="6" x="208" y="112" />
      <circle cx="211" cy="176" fill="#3b1478" r="4" />
      {/* Piggy bank */}
      <g className="save-art-piggy">
        <ellipse cx="102" cy="150" fill="#f5c451" rx="58" ry="44" />
        <path d="M84 108 l10 -16 l12 18 Z" fill="#f5c451" />
        <rect fill="#3b1478" height="7" rx="3.5" width="30" x="84" y="114" />
        <rect fill="#5b21b6" height="22" rx="4" width="16" x="150" y="138" />
        <path d="M134 128 q6 -7 12 0" fill="none" stroke="#3b1478" strokeLinecap="round" strokeWidth="3" />
        <rect fill="#5b21b6" height="16" rx="3" width="16" x="70" y="184" />
        <rect fill="#5b21b6" height="16" rx="3" width="16" x="110" y="184" />
        <path d="M44 142 c-12 -2 -16 -12 -8 -18 c6 -4 12 2 6 8" fill="none" stroke="#f5c451" strokeLinecap="round" strokeWidth="3" />
      </g>
      <g stroke="#a78bfa" strokeLinecap="round" strokeWidth="2.5">
        <path d="M172 112 l8 -6" />
        <path d="M176 126 l10 0" />
        <path d="M168 100 l3 -9" />
      </g>
    </svg>
  );
}

export function PocketsIntro({ disabled, onStart }: { disabled: boolean; onStart: () => void }) {
  return (
    <section className="save-intro">
      <h2 className="save-intro-title">Pockets</h2>
      <p className="save-intro-body">
        Put money aside for anything: rent, a trip, a new laptop. Top up whenever you like, or save a little every time you
        spend.
      </p>
      <PocketsArt />
      <Button className="save-cta" disabled={disabled} onClick={onStart}>
        Save now
      </Button>
    </section>
  );
}

// ── Ways to save ────────────────────────────────────────────────────────────

function WayRow({
  description,
  disabled,
  icon,
  onClick,
  status,
  title,
  tone,
}: {
  description: string;
  disabled: boolean;
  icon: ReactNode;
  onClick: () => void;
  status?: ReactNode;
  title: string;
  tone: "mint" | "lavender" | "amber";
}) {
  return (
    <button className="save-way" disabled={disabled} onClick={onClick} type="button">
      <span className={cn("save-way-icon", `is-${tone}`)}>{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="save-way-title">{title}</span>
          {status}
        </span>
        <span className="save-way-body">{description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function SaveWays({
  disabled,
  onFlexible,
  onLocked,
  onSpendSave,
  spendSave,
}: {
  disabled: boolean;
  onFlexible: () => void;
  onLocked: () => void;
  onSpendSave: () => void;
  spendSave: SpendSaveConfigRecord | null;
}) {
  const pct = spendSave ? Number(spendSave.percentage) : null;
  return (
    <section className="save-section">
      <h2 className="save-section-title">How would you like to save today?</h2>
      <div className="save-ways">
        <WayRow
          description="Save a percentage of every payment you make, automatically."
          disabled={disabled}
          icon={<Percent className="h-5 w-5" />}
          onClick={onSpendSave}
          status={
            spendSave?.enabled ? (
              <span className="save-pill is-on">On · {pct}%</span>
            ) : spendSave ? (
              <span className="save-pill">Paused</span>
            ) : null
          }
          title="Spend + Save"
          tone="mint"
        />
        <WayRow
          description="A flexible pocket. Top it up whenever you want and withdraw any time."
          disabled={disabled}
          icon={<Wallet className="h-5 w-5" />}
          onClick={onFlexible}
          title="As you want"
          tone="lavender"
        />
        <WayRow
          description="Lock money away until a date you choose, so it's there when you need it."
          disabled={disabled}
          icon={<LockKeyhole className="h-5 w-5" />}
          onClick={onLocked}
          title="Locked pocket"
          tone="amber"
        />
      </div>
    </section>
  );
}

// ── Spend&Save status ───────────────────────────────────────────────────────

export function SpendSaveCard({
  disabled,
  onDisable,
  onEdit,
  onPause,
  onResume,
  pocketName,
  spendSave,
}: {
  disabled: boolean;
  onDisable: () => void;
  onEdit: () => void;
  onPause: () => void;
  onResume: () => void;
  pocketName: string | null;
  spendSave: SpendSaveConfigRecord;
}) {
  const pct = Number(spendSave.percentage);
  const active = spendSave.enabled;
  return (
    <section className={cn("save-card save-spend", active && "is-active")}>
      <div className="save-spend-dial" aria-hidden>
        <svg viewBox="0 0 44 44">
          <circle className="save-ring-track" cx="22" cy="22" r="18" />
          <circle
            className="save-ring-fill"
            cx="22"
            cy="22"
            r="18"
            strokeDasharray={`${Math.max(4, Math.min(100, pct * 5)) * 1.131} 200`}
          />
        </svg>
        <span>{pct}%</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          Spend + Save is {active ? "on" : "paused"}
        </p>
        <p className="text-sm text-muted-foreground">
          {pct}% of every payment goes to {pocketName ?? "your pocket"}. Spend $100, save ${((100 * pct) / 100).toFixed(2)}.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button disabled={disabled} onClick={onEdit} size="sm" variant="outline">
            Edit
          </Button>
          {active ? (
            <Button disabled={disabled} onClick={onPause} size="sm" variant="outline">
              <Pause className="h-3.5 w-3.5" /> Pause
            </Button>
          ) : (
            <Button disabled={disabled} onClick={onResume} size="sm" variant="outline">
              <Play className="h-3.5 w-3.5" /> Resume
            </Button>
          )}
          <Button disabled={disabled} onClick={onDisable} size="sm" variant="ghost">
            Turn off
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── Pocket cards ────────────────────────────────────────────────────────────

/** The goal as a ring: how full the pocket is. */
function GoalRing({ percent, reached }: { percent: number | null; reached: boolean }) {
  const value = Math.max(0, Math.min(100, percent ?? 0));
  const circumference = 2 * Math.PI * 22;
  return (
    <span className={cn("save-goal-ring", reached && "is-reached")} aria-hidden>
      <svg viewBox="0 0 52 52">
        <circle className="save-ring-track" cx="26" cy="26" r="22" />
        <circle
          className="save-ring-fill"
          cx="26"
          cy="26"
          r="22"
          strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span>{reached ? "✓" : `${Math.round(value)}%`}</span>
    </span>
  );
}

export function PocketCard({
  disabled,
  hidden,
  onAdd,
  onArchive,
  onWithdraw,
  pocket,
}: {
  disabled: boolean;
  hidden: boolean;
  onAdd: () => void;
  onArchive: () => void;
  onWithdraw: () => void;
  pocket: SavingsPocketRecord;
}) {
  const progress = pocketProgress(pocket);
  const lock = getPocketLockState(pocket);
  const reached = Boolean(
    pocket.target_amount_units &&
      BigInt(pocket.current_balance_units || "0") >= BigInt(pocket.target_amount_units),
  );

  return (
    <article className={cn("save-pocket", reached && "is-reached")}>
      <div className="save-pocket-top">
        <Link className="save-pocket-identity" href={`/save/${pocket.id}`}>
          <span className="save-pocket-emoji">{getPocketEmoji(pocket.icon)}</span>
          <span className="min-w-0">
            <span className="save-pocket-name">{pocket.name}</span>
            <span className="save-pocket-note">
              {lock.kind === "fixed" && lock.locked ? (
                <>
                  <LockKeyhole className="h-3 w-3" /> Locked · {formatLockRemaining(lock.remainingMs)}
                </>
              ) : lock.kind === "fixed" ? (
                "Unlocked"
              ) : (
                "Flexible"
              )}
            </span>
          </span>
        </Link>
        {pocket.target_amount ? <GoalRing percent={progress} reached={reached} /> : null}
      </div>

      <p className="save-pocket-balance">{hidden ? MASK : formatSaved(pocket.current_balance)}</p>
      <p className="save-pocket-goal">
        {reached
          ? `Goal reached. Your ${pocket.name} is fully funded.`
          : pocket.target_amount
            ? `${hidden ? MASK : formatSaved(pocket.target_amount)} goal${pocket.stop_at_target ? " · Spend + Save stops there" : ""}`
            : pocket.description || "No goal set"}
      </p>

      <div className="save-pocket-actions">
        <Button className="flex-1" disabled={disabled} onClick={onAdd} size="sm">
          <ArrowDownToLine className="h-3.5 w-3.5" /> Add money
        </Button>
        <Button
          className="flex-1"
          disabled={disabled || lock.locked}
          onClick={onWithdraw}
          size="sm"
          title={lock.locked ? `Locked until ${formatUnlockDate(lock.until)}` : "Withdraw"}
          variant="outline"
        >
          {lock.locked ? <LockKeyhole className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
          {lock.locked ? "Locked" : "Withdraw"}
        </Button>
        <Button aria-label={`Archive ${pocket.name}`} disabled={disabled} onClick={onArchive} size="sm" title="Archive" variant="ghost">
          <Archive className="h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
  );
}
