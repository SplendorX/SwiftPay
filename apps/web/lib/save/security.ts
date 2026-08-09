/**
 * Pure security helpers for Swift+Save — unit/integration tested without Supabase.
 */

export function assertOwnerMatch(
  sessionOwner: string | null | undefined,
  resourceOwner: string | null | undefined,
): boolean {
  if (!sessionOwner || !resourceOwner) return false;
  return sessionOwner.toLowerCase() === resourceOwner.toLowerCase();
}

export function assertNotCrossUser(
  actorWallet: string,
  resourceOwnerWallet: string,
): void {
  if (actorWallet.toLowerCase() !== resourceOwnerWallet.toLowerCase()) {
    throw new Error("Forbidden: you cannot access another user's savings.");
  }
}

export function assertPositiveAmountUnits(units: bigint): void {
  if (units <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }
}

export function assertSufficientBalance(
  available: bigint,
  required: bigint,
  label = "balance",
): void {
  if (required > available) {
    throw new Error(`Insufficient ${label}.`);
  }
}

export function assertPercentageInRange(
  percentage: string | number,
  min = 1,
  max = 50,
): string {
  const text =
    typeof percentage === "number"
      ? percentage.toFixed(2)
      : String(percentage).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("Invalid percentage.");
  }
  const [w, f = ""] = text.split(".");
  const hundredths = Number(w) * 100 + Number((f + "00").slice(0, 2));
  if (hundredths < min * 100 || hundredths > max * 100) {
    throw new Error(`Percentage must be between ${min}% and ${max}%.`);
  }
  const whole = Math.floor(hundredths / 100);
  const frac = (hundredths % 100).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

export function assertIdempotencyConflict(
  existing: {
    ownerWallet: string;
    pocketId: string;
    amountUnits: string;
  } | null,
  incoming: {
    ownerWallet: string;
    pocketId: string;
    amountUnits: string;
  },
): "reuse" | "create" {
  if (!existing) return "create";
  if (
    existing.ownerWallet.toLowerCase() !== incoming.ownerWallet.toLowerCase() ||
    existing.pocketId !== incoming.pocketId ||
    existing.amountUnits !== incoming.amountUnits
  ) {
    throw new Error(
      "Idempotency key conflicts with an existing transaction.",
    );
  }
  return "reuse";
}

/** Reject client-side amount/percentage tampering when server already computed. */
export function assertClientAmountMatchesServer(
  clientUnits: string | bigint,
  serverUnits: string | bigint,
): void {
  const a = typeof clientUnits === "bigint" ? clientUnits : BigInt(clientUnits);
  const b = typeof serverUnits === "bigint" ? serverUnits : BigInt(serverUnits);
  if (a !== b) {
    throw new Error("Amount does not match server quote.");
  }
}

export function assertPocketActive(status: string): void {
  if (status !== "active") {
    throw new Error("Cannot deposit into an archived pocket.");
  }
}

export function assertTxHash(value: unknown): asserts value is `0x${string}` {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("A valid on-chain transaction hash is required.");
  }
}
