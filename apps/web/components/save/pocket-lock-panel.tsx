"use client";

import { CalendarClock, Loader2, LockKeyhole, Unlock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FIXED_LOCK_PRESETS,
  formatLockRemaining,
  formatUnlockDate,
  getPocketLockState,
} from "@/lib/save/lock";
import type { SavingsPocketRecord } from "@/lib/save/types";
import { cn } from "@/lib/utils";

type PocketLockPanelProps = {
  disabled?: boolean;
  isSaving?: boolean;
  onLock: (input: { lockDays?: number; lockUntil?: string }) => void;
  pocket: SavingsPocketRecord;
};

export function PocketLockPanel({
  disabled,
  isSaving,
  onLock,
  pocket,
}: PocketLockPanelProps) {
  const [now, setNow] = useState(() => new Date());
  const [days, setDays] = useState(30);
  const [customDate, setCustomDate] = useState("");

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const state = useMemo(() => getPocketLockState(pocket, now), [now, pocket]);
  const minDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }, []);

  if (state.kind === "fixed" && state.locked) {
    const elapsed =
      state.durationDays && state.durationDays > 0
        ? Math.min(
            100,
            Math.max(
              0,
              ((state.durationDays * 86_400_000 - state.remainingMs) /
                (state.durationDays * 86_400_000)) *
                100,
            ),
          )
        : 0;

    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <LockKeyhole className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Fixed pocket · locked</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Withdrawals wait until {formatUnlockDate(state.until)}. You can
              still add money.
            </p>
            <p className="mt-3 text-lg font-semibold tracking-tight">
              {formatLockRemaining(state.remainingMs)}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-500/20">
              <div
                className="h-full rounded-full bg-amber-500/80"
                style={{ width: `${elapsed}%` }}
              />
            </div>
            {state.durationDays ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {state.durationDays}-day term
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
          {state.kind === "fixed" ? (
            <Unlock className="h-4 w-4" />
          ) : (
            <CalendarClock className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {state.kind === "fixed"
              ? "Lock ended. Withdraw anytime"
              : "Flexible pocket"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {state.kind === "fixed"
              ? "This term is over. Lock it again if you want another hands-off stretch."
              : "Withdraw whenever you want, or convert it to a fixed term so you cannot take money out until the date you choose."}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {FIXED_LOCK_PRESETS.map((preset) => (
              <button
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  days === preset.days && !customDate
                    ? "border-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
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

          <label className="mt-3 block text-xs text-muted-foreground">
            Or pick an unlock date
            <Input
              className="mt-1 h-9"
              min={minDate}
              onChange={(event) => setCustomDate(event.target.value)}
              type="date"
              value={customDate}
            />
          </label>

          <Button
            className="mt-3"
            disabled={disabled || isSaving}
            onClick={() =>
              onLock(
                customDate
                  ? { lockUntil: new Date(`${customDate}T23:59:59`).toISOString() }
                  : { lockDays: days },
              )
            }
            size="sm"
            type="button"
          >
            {isSaving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <LockKeyhole className="mr-1.5 h-3.5 w-3.5" />
            )}
            {state.kind === "fixed" ? "Lock again" : "Lock this pocket"}
          </Button>
        </div>
      </div>
    </div>
  );
}
