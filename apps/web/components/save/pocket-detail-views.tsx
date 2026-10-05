"use client";

import {
  Archive,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  ArrowUpRight,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Percent,
  RotateCcw,
  Trash2,
  Undo2,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { formatSaved } from "@/components/save/save-views";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import { countByGroup, type PocketActivityFilter, type PocketActivityItem } from "@/lib/save/activity";
import { explorerTxUrl } from "@/lib/save/config";
import { FIXED_LOCK_PRESETS, formatLockRemaining, formatUnlockDate, getPocketLockState } from "@/lib/save/lock";
import { getPocketEmoji, type SavingsPocketRecord, type SpendSaveConfigRecord } from "@/lib/save/types";
import { useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const MASK = "••••••";
type LockState = ReturnType<typeof getPocketLockState>;

// ── Top bar ─────────────────────────────────────────────────────────────────

export function PocketBar({ name, onMore }: { name: string; onMore?: () => void }) {
  return (
    <header className="pocket-bar">
      <Link aria-label="Back to Save" className="pocket-round" href="/save">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="pocket-bar-title">{name}</h1>
      {onMore ? (
        <button aria-label="Pocket options" className="pocket-round" onClick={onMore} type="button">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      ) : (
        <span />
      )}
    </header>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

export function PocketHero({
  canAct,
  hidden,
  lock,
  onAdd,
  onToggleHidden,
  onWithdraw,
  pocket,
  progress,
}: {
  canAct: boolean;
  hidden: boolean;
  lock: LockState;
  onAdd: () => void;
  onToggleHidden: () => void;
  onWithdraw: () => void;
  pocket: SavingsPocketRecord;
  progress: number | null;
}) {
  const hasGoal = Boolean(pocket.target_amount);
  const value = Math.max(0, Math.min(100, progress ?? 0));
  const reached = hasGoal && value >= 100;
  const left = hasGoal ? Math.max(0, Number(pocket.target_amount) - Number(pocket.current_balance)) : 0;
  const circumference = 2 * Math.PI * 54;

  return (
    <section className={cn("pocket-hero", reached && "is-reached")}>
      <span aria-hidden className="pocket-hero-orb" />
      <div className="pocket-hero-main">
        <div className="pocket-hero-identity">
          <span className="pocket-hero-emoji">{getPocketEmoji(pocket.icon)}</span>
          <span className="pocket-hero-tag">
            {lock.kind === "fixed" && lock.locked ? (
              <>
                <LockKeyhole className="h-3.5 w-3.5" /> Locked
              </>
            ) : lock.kind === "fixed" ? (
              <>
                <Unlock className="h-3.5 w-3.5" /> Lock ended
              </>
            ) : (
              "Flexible"
            )}
          </span>
          {pocket.status !== "active" ? <span className="pocket-hero-tag">Archived</span> : null}
        </div>
        <p className="pocket-hero-label">Balance</p>
        <div className="pocket-hero-amount-row">
          <p className="pocket-hero-amount">{hidden ? MASK : formatSaved(pocket.current_balance)}</p>
          <button aria-label={hidden ? "Show balances" : "Hide balances"} className="pocket-hero-eye" onClick={onToggleHidden} type="button">
            {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="pocket-hero-note">
          {reached
            ? `Goal reached. Your ${pocket.name} is fully funded.`
            : hasGoal
              ? `${hidden ? MASK : formatSaved(left.toFixed(2))} to go to your ${hidden ? MASK : formatSaved(pocket.target_amount)} goal`
              : pocket.description || "No goal set. Add one from the options."}
        </p>
        <div className="pocket-hero-actions">
          <button className="pocket-hero-button is-primary" disabled={!canAct} onClick={onAdd} type="button">
            <ArrowDownToLine className="h-4 w-4" /> Add money
          </button>
          <button
            className="pocket-hero-button"
            disabled={!canAct || lock.locked}
            onClick={onWithdraw}
            title={lock.locked ? `Locked until ${formatUnlockDate(lock.until)}` : "Withdraw"}
            type="button"
          >
            {lock.locked ? <LockKeyhole className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
            {lock.locked ? "Locked" : "Withdraw"}
          </button>
        </div>
      </div>

      {hasGoal ? (
        <div className="pocket-hero-ring" aria-label={`${Math.round(value)}% of goal`} role="img">
          <svg viewBox="0 0 128 128">
            <circle className="pocket-ring-track" cx="64" cy="64" r="54" />
            <circle
              className="pocket-ring-fill"
              cx="64"
              cy="64"
              r="54"
              strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
            />
          </svg>
          <span>
            <strong>{reached ? "✓" : `${Math.round(value)}%`}</strong>
            <small>{reached ? "Funded" : "of goal"}</small>
          </span>
        </div>
      ) : null}
    </section>
  );
}

// ── Lock ────────────────────────────────────────────────────────────────────

export function PocketLockCard({
  busy,
  canAct,
  lock,
  onLock,
}: {
  busy: boolean;
  canAct: boolean;
  lock: LockState;
  onLock: (input: { lockDays?: number; lockUntil?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const [customDate, setCustomDate] = useState("");
  const minDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }, []);

  if (lock.kind === "fixed" && lock.locked) {
    const total = lock.durationDays && lock.durationDays > 0 ? lock.durationDays * 86_400_000 : 0;
    const elapsed = total ? Math.min(100, Math.max(0, ((total - lock.remainingMs) / total) * 100)) : 0;
    const daysLeft = Math.max(1, Math.ceil(lock.remainingMs / 86_400_000));
    const circumference = 2 * Math.PI * 30;
    return (
      <section className="pocket-card pocket-lock is-locked">
        <div className="pocket-lock-ring" aria-hidden>
          <svg viewBox="0 0 72 72">
            <circle className="pocket-lock-track" cx="36" cy="36" r="30" />
            <circle
              className="pocket-lock-fill"
              cx="36"
              cy="36"
              r="30"
              strokeDasharray={`${(elapsed / 100) * circumference} ${circumference}`}
            />
          </svg>
          <span>
            <strong>{daysLeft}</strong>
            <small>{daysLeft === 1 ? "day" : "days"}</small>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Locked until {formatUnlockDate(lock.until)}</p>
          <p className="text-sm text-muted-foreground">
            {formatLockRemaining(lock.remainingMs)}
            {lock.durationDays ? ` of a ${lock.durationDays}-day term` : ""}. You can still add money; withdrawals open on
            the unlock date.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="pocket-card pocket-lock">
      <button aria-expanded={open} className="pocket-lock-toggle" onClick={() => setOpen((value) => !value)} type="button">
        <span className="pocket-lock-icon">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block font-semibold">{lock.kind === "fixed" ? "Lock it again" : "Lock this pocket"}</span>
          <span className="block text-sm text-muted-foreground">
            {lock.kind === "fixed"
              ? "The last lock has ended. Start another hands-off stretch."
              : "Keep your hands off it until a date you choose. No withdrawals before then."}
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="pocket-lock-form">
          <div className="flex flex-wrap gap-2">
            {FIXED_LOCK_PRESETS.map((preset) => (
              <button
                aria-pressed={days === preset.days && !customDate}
                className="pocket-chip"
                key={preset.days}
                onClick={() => {
                  setDays(preset.days);
                  setCustomDate("");
                }}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="grid gap-1.5 text-sm text-muted-foreground">
            Or pick an unlock date
            <Input className="h-11" min={minDate} onChange={(event) => setCustomDate(event.target.value)} type="date" value={customDate} />
          </label>
          <Button
            disabled={!canAct || busy}
            onClick={() =>
              onLock(customDate ? { lockUntil: new Date(`${customDate}T23:59:59`).toISOString() } : { lockDays: days })
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            Lock until{" "}
            {customDate
              ? formatUnlockDate(new Date(`${customDate}T23:59:59`))
              : formatUnlockDate(new Date(Date.now() + days * 86_400_000))}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// ── Spend + Save and figures ────────────────────────────────────────────────

export function PocketSpendSave({ spendSave }: { spendSave: SpendSaveConfigRecord }) {
  const pct = Number(spendSave.percentage);
  return (
    <section className={cn("pocket-card pocket-spend", spendSave.enabled && "is-on")}>
      <span className="pocket-spend-icon">
        <Percent className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Spend + Save {spendSave.enabled ? "fills this pocket" : "is paused"}</p>
        <p className="text-sm text-muted-foreground">
          {pct}% of every payment you make lands here. Change it from Save.
        </p>
      </div>
    </section>
  );
}

export function PocketFigures({
  created,
  hidden,
  lastDepositAt,
  totalIn,
  totalOut,
}: {
  created: string;
  hidden: boolean;
  lastDepositAt: string | null;
  totalIn: string;
  totalOut: string;
}) {
  const figures: Array<{ label: string; value: ReactNode }> = [
    { label: "Money in", value: hidden ? MASK : formatSaved(totalIn) },
    { label: "Money out", value: hidden ? MASK : formatSaved(totalOut) },
    {
      label: "Last top-up",
      value: lastDepositAt ? new Date(lastDepositAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—",
    },
    { label: "Opened", value: new Date(created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) },
  ];
  return (
    <section className="pocket-figures">
      {figures.map((figure) => (
        <div className="pocket-card pocket-figure" key={figure.label}>
          <span className="pocket-figure-value">{figure.value}</span>
          <span className="pocket-figure-label">{figure.label}</span>
        </div>
      ))}
    </section>
  );
}

// ── Activity (this pocket only) ─────────────────────────────────────────────

const kindLabel: Record<PocketActivityItem["kind"], string> = {
  adjustment: "Adjustment",
  deposit: "Added money",
  refund: "Refunded",
  reversal: "Reversed for a refund",
  spend_save: "Spend + Save",
  withdrawal: "Withdrew",
};

function statusTone(status: string) {
  if (status === "COMPLETED") return null;
  if (status === "FAILED") return { label: "Failed", tone: "bad" };
  if (status === "REQUIRES_RECONCILIATION") return { label: "Checking", tone: "warn" };
  return { label: "Pending", tone: "warn" };
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", weekday: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function PocketActivity({
  acting,
  canReverse,
  hidden,
  items,
  onReverse,
}: {
  acting: boolean;
  canReverse: boolean;
  hidden: boolean;
  items: PocketActivityItem[];
  onReverse: (item: PocketActivityItem) => void;
}) {
  const [filter, setFilter] = useState<PocketActivityFilter>("ALL");
  const [shown, setShown] = useState(15);
  const counts = countByGroup(items);
  const visible = filter === "ALL" ? items : items.filter((item) => item.group === filter);

  const groups = useMemo(() => {
    const out: Array<{ label: string; items: PocketActivityItem[] }> = [];
    for (const item of visible.slice(0, shown)) {
      const label = dayLabel(item.createdAt);
      const last = out.at(-1);
      if (last?.label === label) last.items.push(item);
      else out.push({ items: [item], label });
    }
    return out;
  }, [shown, visible]);

  const tabs: Array<{ id: PocketActivityFilter; label: string }> = [
    { id: "ALL", label: "All" },
    { id: "DEPOSIT", label: "Added" },
    { id: "WITHDRAWAL", label: "Withdrawn" },
    { id: "SPEND_SAVE", label: "Spend + Save" },
  ];

  return (
    <section className="pocket-activity">
      <div className="pocket-activity-head">
        <h2 className="pocket-section-title">Activity</h2>
        <div className="pocket-tabs" role="tablist" aria-label="Filter activity">
          {tabs
            .filter((tab) => tab.id === "ALL" || counts[tab.id] > 0)
            .map((tab) => (
              <button
                aria-selected={filter === tab.id}
                key={tab.id}
                onClick={() => {
                  setFilter(tab.id);
                  setShown(15);
                }}
                role="tab"
                type="button"
              >
                {tab.label}
                <span>{counts[tab.id]}</span>
              </button>
            ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="pocket-card pocket-activity-empty">
          <p className="font-semibold">Nothing here yet</p>
          <p className="text-sm text-muted-foreground">Money you add, withdraw or save as you spend shows up here, for this pocket only.</p>
        </div>
      ) : (
        <div className="pocket-card p-0">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="pocket-day">{group.label}</p>
              <ul>
                {group.items.map((item) => {
                  const tone = statusTone(item.status);
                  const reversible =
                    canReverse && item.kind === "spend_save" && item.status === "COMPLETED" && item.transaction;
                  return (
                    <li className="pocket-row" key={item.id}>
                      <span className={cn("pocket-row-icon", `is-${item.kind}`)} aria-hidden>
                        {item.kind === "deposit" ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : item.kind === "spend_save" ? (
                          <Percent className="h-4 w-4" />
                        ) : item.kind === "withdrawal" ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="pocket-row-title">
                          {kindLabel[item.kind]}
                          {tone ? <span className={cn("pocket-status", `is-${tone.tone}`)}>{tone.label}</span> : null}
                        </p>
                        <p className="pocket-row-meta">
                          {item.spend
                            ? `${item.spend.savePercentage}% of a ${hidden ? MASK : formatSaved(item.spend.paymentAmount)} payment`
                            : new Date(item.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          {item.txHash ? (
                            <a href={explorerTxUrl(item.txHash)} rel="noreferrer" target="_blank">
                              View
                            </a>
                          ) : null}
                          {item.spend?.paymentTxHash ? (
                            <a href={explorerTxUrl(item.spend.paymentTxHash)} rel="noreferrer" target="_blank">
                              Payment
                            </a>
                          ) : null}
                        </p>
                        {item.failureReason ? <p className="text-xs text-destructive">{item.failureReason}</p> : null}
                      </div>
                      <div className="grid justify-items-end gap-1">
                        <span className={cn("pocket-row-amount", item.direction === "in" ? "is-in" : "is-out")}>
                          {item.direction === "in" ? "+" : "−"}
                          {hidden ? MASK : formatSaved(item.amount)}
                        </span>
                        {reversible ? (
                          <button className="pocket-reverse" disabled={acting} onClick={() => onReverse(item)} type="button">
                            <Undo2 className="h-3 w-3" /> Payment refunded?
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {visible.length > shown ? (
            <button className="pocket-more" onClick={() => setShown((value) => value + 15)} type="button">
              Show more
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ── Options and edit sheets ─────────────────────────────────────────────────

export function PocketOptionsSheet({
  canAct,
  canDelete,
  deleting,
  onArchive,
  onClose,
  onDelete,
  onEdit,
  open,
}: {
  canAct: boolean;
  canDelete: boolean;
  deleting: boolean;
  onArchive: () => void;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  open: boolean;
}) {
  const side = useSheetSide();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          setConfirm(null);
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className={cn("gap-0 p-0", side === "bottom" ? "rounded-t-[1.75rem] border-t-0 pb-[max(1rem,env(safe-area-inset-bottom))]" : "sm:max-w-sm")}
        showCloseButton={false}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <SheetTitle className="px-5 pb-2 pt-7 text-center text-lg font-bold">Pocket options</SheetTitle>
        <SheetDescription className="sr-only">Edit, archive or delete this pocket.</SheetDescription>
        <div className="grid gap-2 px-5 pb-4">
          {confirm ? (
            <div className="grid gap-3 rounded-2xl border border-border p-4">
              <p className="text-sm">
                {confirm === "delete"
                  ? "Delete this empty pocket? This can't be undone."
                  : "Archive this pocket? It leaves your list, and its history is kept."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setConfirm(null)} variant="outline">
                  Keep it
                </Button>
                <Button
                  disabled={deleting || !canAct}
                  onClick={confirm === "delete" ? onDelete : onArchive}
                  variant={confirm === "delete" ? "destructive" : "default"}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {confirm === "delete" ? "Delete" : "Archive"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <button className="pocket-option" disabled={!canAct} onClick={onEdit} type="button">
                <Pencil className="h-4 w-4" /> Edit name, goal and note
              </button>
              <button className="pocket-option" disabled={!canAct} onClick={() => setConfirm("archive")} type="button">
                <Archive className="h-4 w-4" /> Archive pocket
              </button>
              {canDelete ? (
                <button className="pocket-option is-danger" disabled={!canAct} onClick={() => setConfirm("delete")} type="button">
                  <Trash2 className="h-4 w-4" /> Delete pocket
                </button>
              ) : (
                <p className="px-1 pt-1 text-xs text-muted-foreground">
                  Only an empty pocket with no history can be deleted. Archive keeps the record instead.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function PocketEditSheet({
  busy,
  description,
  name,
  onClose,
  onDescription,
  onName,
  onSave,
  onStopAtTarget,
  onTarget,
  open,
  stopAtTarget,
  target,
}: {
  busy: boolean;
  description: string;
  name: string;
  onClose: () => void;
  onDescription: (value: string) => void;
  onName: (value: string) => void;
  onSave: () => void;
  onStopAtTarget: (value: boolean) => void;
  onTarget: (value: string) => void;
  open: boolean;
  stopAtTarget: boolean;
  target: string;
}) {
  const side = useSheetSide();
  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent
        className={cn("w-full gap-0 p-0 sm:max-w-md", side === "bottom" && "max-h-[92dvh] rounded-t-[1.75rem] border-t-0 sm:max-w-none")}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="grid gap-4 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
          <SheetTitle className="text-xl font-bold">Edit pocket</SheetTitle>
          <SheetDescription className="sr-only">Change the name, goal and note.</SheetDescription>
          <label className="grid gap-1.5 text-sm font-medium">
            Name
            <Input className="h-12" maxLength={50} onChange={(event) => onName(event.target.value)} value={name} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Goal (optional)
            <Input
              className="h-12"
              inputMode="decimal"
              onChange={(event) => onTarget(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="No goal"
              value={target}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Note (optional)
            <Input className="h-12" onChange={(event) => onDescription(event.target.value)} placeholder="What it's for" value={description} />
          </label>
          {target.trim() ? (
            <button
              aria-pressed={stopAtTarget}
              className={cn("pocket-switch-row", stopAtTarget && "is-on")}
              onClick={() => onStopAtTarget(!stopAtTarget)}
              type="button"
            >
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-semibold">Stop Spend + Save at the goal</span>
                <span className="block text-sm text-muted-foreground">Off: keep saving beyond it.</span>
              </span>
              <span aria-hidden className="pocket-switch">
                <span />
              </span>
            </button>
          ) : null}
          <Button className="h-12" disabled={busy || !name.trim()} onClick={onSave}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
