"use client";

export type TwoFactorStatus = {
  available: boolean;
  backupCodesLeft?: number;
  enabled: boolean;
  pending: boolean;
  signedIn: boolean;
};

export class TwoFactorError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: { attemptsLeft?: number; pausedUntil?: string } = {},
  ) {
    super(message);
  }
}

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  const response = await fetch("/api/two-factor", { cache: "no-store", credentials: "include" });
  if (!response.ok) throw new TwoFactorError("Two-factor status couldn't be checked.", response.status);
  return (await response.json()) as TwoFactorStatus;
}

export async function postTwoFactor<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/api/two-factor", {
    body: JSON.stringify({ action, ...body }),
    cache: "no-store",
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new TwoFactorError(
      typeof payload.message === "string" ? payload.message : "Something went wrong.",
      response.status,
      {
        attemptsLeft: typeof payload.attemptsLeft === "number" ? payload.attemptsLeft : undefined,
        pausedUntil: typeof payload.pausedUntil === "string" ? payload.pausedUntil : undefined,
      },
    );
  }
  return payload as T;
}

export function twoFactorErrorMessage(cause: unknown) {
  if (cause instanceof TwoFactorError) {
    if (cause.details.pausedUntil) {
      const minutes = Math.max(1, Math.ceil((Date.parse(cause.details.pausedUntil) - Date.now()) / 60_000));
      return `Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    if (cause.details.attemptsLeft != null) {
      return `That code isn't right. ${cause.details.attemptsLeft} ${cause.details.attemptsLeft === 1 ? "try" : "tries"} left before a pause.`;
    }
    return cause.message;
  }
  return "Couldn't reach SaphraONE. Check your connection and try again.";
}

/** Save backup codes as a text file. */
export function downloadBackupCodes(codes: string[]) {
  const text = [
    "SaphraONE two-factor backup codes",
    "Each code works once. Keep them somewhere safe.",
    "",
    ...codes,
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "saphra-backup-codes.txt";
  link.click();
  URL.revokeObjectURL(url);
}
