"use client";

import { Delete } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

export const PIN_LENGTH = 6;

/**
 * Six dots and a phone-style keypad. Typing digits on a keyboard works too.
 * Calls onComplete once the sixth digit is in.
 */
export function PinPad({
  disabled = false,
  error = false,
  onChange,
  onComplete,
  value,
}: {
  disabled?: boolean;
  error?: boolean;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  value: string;
}) {
  function press(digit: string) {
    if (disabled || value.length >= PIN_LENGTH) return;
    const next = value + digit;
    onChange(next);
    if (next.length === PIN_LENGTH) onComplete?.(next);
  }

  function erase() {
    if (!disabled) onChange(value.slice(0, -1));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") erase();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid justify-items-center gap-7">
      <div
        aria-label={`${value.length} of ${PIN_LENGTH} digits entered`}
        className={cn("flex gap-3", error && "animate-[app-lock-shake_0.35s_ease-in-out]")}
        role="status"
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            className={cn(
              "h-3.5 w-3.5 rounded-full border-2 transition",
              index < value.length
                ? error
                  ? "border-destructive bg-destructive"
                  : "border-primary bg-primary"
                : "border-muted-foreground/40",
            )}
            key={index}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <KeyButton disabled={disabled} key={digit} onClick={() => press(digit)}>
            {digit}
          </KeyButton>
        ))}
        <span />
        <KeyButton disabled={disabled} onClick={() => press("0")}>
          0
        </KeyButton>
        <KeyButton ariaLabel="Delete" disabled={disabled || value.length === 0} onClick={erase}>
          <Delete className="h-5 w-5" />
        </KeyButton>
      </div>
    </div>
  );
}

function KeyButton({
  ariaLabel,
  children,
  disabled,
  onClick,
}: {
  ariaLabel?: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 text-2xl font-semibold text-foreground transition hover:bg-muted active:scale-95 disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
