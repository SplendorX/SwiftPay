"use client";

import { CalendarClock, Loader2, LockKeyhole, Unlock } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createSavingsPocket } from "@/lib/save/client";
import {
  FIXED_LOCK_PRESETS,
  formatUnlockDate,
  lockUntilFromDays,
} from "@/lib/save/lock";
import {
  POCKET_ICON_PRESETS,
  type SavingsPocketRecord,
} from "@/lib/save/types";
import type { ArcTokenSymbol } from "@/lib/tokens";
import { cn } from "@/lib/utils";

type CreatePocketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerWallet: string;
  circleSocialUuid?: string;
  currency?: ArcTokenSymbol;
  onCreated: (pocket: SavingsPocketRecord) => void;
};

export function CreatePocketDialog({
  open,
  onOpenChange,
  ownerWallet,
  circleSocialUuid,
  currency = "USDC",
  onCreated,
}: CreatePocketDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("piggy");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [stopAtTarget, setStopAtTarget] = useState(false);
  const [lockKind, setLockKind] = useState<"flexible" | "fixed">("flexible");
  const [lockDays, setLockDays] = useState(30);
  const [customDate, setCustomDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }, []);

  const previewUnlock = useMemo(() => {
    if (lockKind !== "fixed") return null;
    if (customDate) {
      return formatUnlockDate(new Date(`${customDate}T23:59:59`));
    }
    return formatUnlockDate(lockUntilFromDays(lockDays));
  }, [customDate, lockDays, lockKind]);

  function reset() {
    setName("");
    setIcon("piggy");
    setDescription("");
    setTargetAmount("");
    setStopAtTarget(false);
    setLockKind("flexible");
    setLockDays(30);
    setCustomDate("");
    setError(null);
  }

  async function handleCreate() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) {
      setError("Pocket name must be 1–50 characters.");
      return;
    }

    try {
      setIsSaving(true);
      const { pocket } = await createSavingsPocket({
        ownerWallet,
        circleSocialUuid,
        name: trimmed,
        icon,
        description: description.trim() || undefined,
        targetAmount: targetAmount.trim() || undefined,
        stopAtTarget: targetAmount.trim() ? stopAtTarget : false,
        currency,
        lockKind,
        lockDays: lockKind === "fixed" && !customDate ? lockDays : undefined,
        lockUntil:
          lockKind === "fixed" && customDate
            ? new Date(`${customDate}T23:59:59`).toISOString()
            : undefined,
      });
      onCreated(pocket);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create pocket.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create savings pocket</DialogTitle>
          <DialogDescription>
            Separate money you want to save from money you want to spend. No
            interest or APY — just structure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Pocket name *
            </label>
            <Input
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder="Emergency Fund"
              value={name}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {POCKET_ICON_PRESETS.map((preset) => (
                <button
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition",
                    icon === preset.id
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40",
                  )}
                  key={preset.id}
                  onClick={() => setIcon(preset.id)}
                  title={preset.label}
                  type="button"
                >
                  {preset.emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              How should this pocket work?
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  lockKind === "flexible"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40",
                )}
                onClick={() => setLockKind("flexible")}
                type="button"
              >
                <Unlock className="h-4 w-4 text-primary" />
                <p className="mt-2 text-sm font-semibold">Flexible</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Add and withdraw anytime. Good for emergency cash.
                </p>
              </button>
              <button
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  lockKind === "fixed"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40",
                )}
                onClick={() => setLockKind("fixed")}
                type="button"
              >
                <LockKeyhole className="h-4 w-4 text-primary" />
                <p className="mt-2 text-sm font-semibold">Fixed</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Lock it for a term. You can add money, but you cannot withdraw
                  until it unlocks.
                </p>
              </button>
            </div>
          </div>

          {lockKind === "fixed" ? (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                Choose the lock term
              </p>
              <div className="flex flex-wrap gap-2">
                {FIXED_LOCK_PRESETS.map((preset) => (
                  <button
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                      lockDays === preset.days && !customDate
                        ? "border-primary bg-background"
                        : "border-border/80 bg-background/60 text-muted-foreground",
                    )}
                    key={preset.days}
                    onClick={() => {
                      setLockDays(preset.days);
                      setCustomDate("");
                    }}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-muted-foreground">
                Or unlock on a specific date
                <Input
                  className="mt-1 h-9 bg-background"
                  min={minDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                  type="date"
                  value={customDate}
                />
              </label>
              {previewUnlock ? (
                <p className="inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-900 dark:text-amber-100">
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Withdrawals stay closed until {previewUnlock}.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Savings target (optional)
            </label>
            <Input
              inputMode="decimal"
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="1000"
              value={targetAmount}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Goal note (optional)
            </label>
            <Input
              maxLength={280}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="3 months of expenses"
              value={description}
            />
          </div>

          {targetAmount.trim() ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 text-sm">
              <input
                checked={stopAtTarget}
                className="mt-1"
                onChange={(e) => setStopAtTarget(e.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="font-medium">Stop saving when target is reached</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Spend&Save will only fill the remaining room. Leave unchecked
                  to continue saving beyond your target.
                </span>
              </span>
            </label>
          ) : null}

          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isSaving} onClick={() => void handleCreate()} type="button">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create pocket"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
