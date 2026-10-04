/**
 * Charge codes: 10 characters of Crockford base32 (no I, L, O, U), short
 * enough to read out at a counter, random enough not to be guessed.
 */

export const CHARGE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CHARGE_CODE_LENGTH = 10;

function randomBytes(count: number) {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** 10 symbols from 8 random bytes (64 bits, the top 50 used). */
export function generateChargeCode(bytes: Uint8Array = randomBytes(8)) {
  let value = 0n;
  for (const byte of bytes.slice(0, 8)) {
    value = (value << 8n) | BigInt(byte);
  }
  let code = "";
  for (let index = 0; index < CHARGE_CODE_LENGTH; index += 1) {
    code = CHARGE_CODE_ALPHABET[Number(value & 31n)] + code;
    value >>= 5n;
  }
  return code;
}

/**
 * A code as typed or scanned: uppercased, separators dropped, and the
 * look-alikes Crockford folds (O → 0, I/L → 1). Null when it can't be a code.
 */
export function normalizeChargeCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (code.length !== CHARGE_CODE_LENGTH) return null;
  for (const char of code) {
    if (!CHARGE_CODE_ALPHABET.includes(char)) return null;
  }
  return code;
}
