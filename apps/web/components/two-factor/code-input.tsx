"use client";

import { Input } from "@/components/ui/input";

/**
 * One field for a 6-digit authenticator code: numeric keyboard on phones,
 * the OS's one-time-code autofill, and paste of a code with spaces.
 */
export function CodeInput({
  autoFocus,
  disabled,
  onChange,
  onComplete,
  value,
}: {
  autoFocus?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  value: string;
}) {
  return (
    <Input
      aria-label="6-digit code"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      className="h-14 w-48 text-center font-mono text-2xl tracking-[0.4em]"
      disabled={disabled}
      inputMode="numeric"
      maxLength={7}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, "").slice(0, 6);
        onChange(next);
        if (next.length === 6) onComplete?.(next);
      }}
      placeholder="000000"
      value={value}
    />
  );
}
