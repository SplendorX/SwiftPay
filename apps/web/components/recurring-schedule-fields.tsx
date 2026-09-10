"use client";

import { StyledSelect } from "@/components/ui/styled-select";
import { Input } from "@/components/ui/input";
import {
  formatFrequencyLabel,
  recurringFrequencies,
  type RecurringFrequency,
} from "@/lib/recurring-utils";

export type RecurringScheduleDraft = {
  autopayEnabled: boolean;
  endsAt: string;
  frequency: RecurringFrequency;
  intervalDays: string;
  maxRuns: string;
  startsAt: string;
};

export function toDatetimeLocalValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function datetimeLocalToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

const START_TIME_GRACE_MS = 60_000;

export function startTimeError(value: string) {
  const iso = datetimeLocalToIso(value);
  if (!iso) {
    return "Enter a valid start time.";
  }
  if (new Date(iso).getTime() < Date.now() - START_TIME_GRACE_MS) {
    return "Start time must be in the future.";
  }
  return null;
}

export function isoToDatetimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return toDatetimeLocalValue(date);
}

export function createRecurringDraft(): RecurringScheduleDraft {
  return {
    autopayEnabled: false,
    endsAt: "",
    frequency: "monthly",
    intervalDays: "30",
    maxRuns: "",
    startsAt: toDatetimeLocalValue(),
  };
}

export function RecurringScheduleFields({
  onChange,
  showAutopay = true,
  value,
}: {
  onChange: (next: RecurringScheduleDraft) => void;
  showAutopay?: boolean;
  value: RecurringScheduleDraft;
}) {
  function patch(partial: Partial<RecurringScheduleDraft>) {
    onChange({ ...value, ...partial });
  }

  const startError = startTimeError(value.startsAt);
  const minStart = toDatetimeLocalValue();

  return (
    <div className="grid gap-3">
      <label className="grid gap-2">
        <span className="text-sm font-semibold">Frequency</span>
        <StyledSelect
          ariaLabel="Select recurring payment frequency"
          className="w-full"
          onChange={(frequency) => patch({ frequency })}
          options={recurringFrequencies.map((option) => ({
            label: formatFrequencyLabel(option),
            value: option,
          }))}
          value={value.frequency}
        />
      </label>

      {value.frequency === "custom" ? (
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Interval days</span>
          <Input
            inputMode="numeric"
            onChange={(event) => patch({ intervalDays: event.target.value })}
            value={value.intervalDays}
          />
        </label>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Start time</span>
          <Input
            aria-invalid={Boolean(startError)}
            min={minStart}
            onChange={(event) => patch({ startsAt: event.target.value })}
            type="datetime-local"
            value={value.startsAt}
          />
          {startError ? (
            <span className="text-xs text-destructive">{startError}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Must be now or later. Past times cannot be scheduled.
            </span>
          )}
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold">End time</span>
          <Input
            onChange={(event) => patch({ endsAt: event.target.value })}
            type="datetime-local"
            value={value.endsAt}
          />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-semibold">Max runs (optional)</span>
        <Input
          inputMode="numeric"
          onChange={(event) => patch({ maxRuns: event.target.value })}
          placeholder="Unlimited"
          value={value.maxRuns}
        />
      </label>

      {showAutopay ? (
        <label className="flex items-start gap-3 rounded-[1rem] border border-border px-3 py-3">
          <input
            checked={value.autopayEnabled}
            className="mt-1"
            onChange={(event) => patch({ autopayEnabled: event.target.checked })}
            type="checkbox"
          />
          <span className="grid gap-1">
            <span className="text-sm font-semibold">Authorize Autopay</span>
            <span className="text-xs text-muted-foreground">
              Approve the SwiftRecurepay executor once, then due payments can
              settle in the background. This does not store your private key.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

export function RecurringToggle({
  checked,
  label = "Make this a recurring payment",
  onCheckedChange,
}: {
  checked: boolean;
  label?: string;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-border bg-card px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Off by default. Turn on to set frequency, start time, and end time.
        </p>
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className="sp-toggle"
        data-on={checked ? "true" : "false"}
        onClick={() => onCheckedChange(!checked)}
        role="switch"
        type="button"
      >
        <span className="sp-toggle-knob" />
      </button>
    </div>
  );
}
