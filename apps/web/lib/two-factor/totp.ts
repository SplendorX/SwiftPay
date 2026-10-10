import crypto from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238): 6 digits, 30-second steps,
 * HMAC-SHA1 — what Google Authenticator, Microsoft Authenticator, Authy and
 * 1Password all read from an otpauth:// QR code.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the previous and next step too, for clock drift. */
const WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 as authenticator apps expect. */
export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

export function totpAt(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * The time step `code` matches, or null. Steps at or before `lastStep` are
 * refused, so a code that was already used (or an older one) can't be replayed.
 */
export function verifyTotp(secret: string, code: string, lastStep = 0, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const candidate = step + offset;
    if (candidate <= lastStep) continue;
    const expected = Buffer.from(totpAt(secret, candidate));
    if (crypto.timingSafeEqual(expected, Buffer.from(code))) return candidate;
  }
  return null;
}

/** The otpauth:// URI an authenticator app scans. */
export function otpauthUri(secret: string, accountLabel: string) {
  const issuer = "SaphraONE";
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    algorithm: "SHA1",
    digits: String(DIGITS),
    issuer,
    period: String(STEP_SECONDS),
    secret,
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
