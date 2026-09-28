import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { setWalletSessionCookies } from "@/lib/circle-wallet-session";
import { readJsonRecord } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { secureCookieFor } from "@/lib/secure-cookie";
import {
  checkCode,
  decryptSecret,
  deleteTwoFactor,
  encryptSecret,
  findTwoFactor,
  generateBackupCodes,
  hashBackupCodes,
  replaceBackupCodes,
  saveTwoFactor,
  stepForSetup,
  twoFactorAvailable,
  type CodeCheck,
  type TwoFactorRow,
} from "@/lib/two-factor/server";
import { generateTotpSecret, otpauthUri } from "@/lib/two-factor/totp";
import {
  createSignedToken,
  createWalletToken,
  readSignedToken,
  readWalletToken,
  sessionWallets,
  walletSessionCookieName,
  type WalletTokenPayload,
} from "@/lib/wallet-session";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };
/** The secret being set up, until the first code confirms it. */
const pendingCookieName = "swiftpay_2fa_setup";
const pendingTtlMs = 10 * 60_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { headers: noStore, status });
}

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ message, ...extra }, status);
}

function codeFailure(result: CodeCheck) {
  if (result.ok) return null;
  if (result.reason === "paused") {
    return jsonError("Too many wrong codes. Try again later.", 429, { pausedUntil: result.until });
  }
  return jsonError("That code isn't right.", 401, { attemptsLeft: result.attemptsLeft });
}

function readCodeInput(body: Record<string, unknown>) {
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
  const backupCode = typeof body.backupCode === "string" ? body.backupCode.trim() : "";
  return {
    backupCode: backupCode || undefined,
    code: /^\d{6}$/.test(code) ? code : undefined,
  };
}

async function readContext() {
  const cookieStore = await cookies();
  const session = readWalletToken(cookieStore.get(walletSessionCookieName)?.value, "session");
  return {
    pendingToken: cookieStore.get(pendingCookieName)?.value,
    session,
    wallets: session ? [session.ownerWallet.toLowerCase(), ...sessionWallets(session)] : [],
  };
}

async function clearPendingFlag(response: NextResponse, session: WalletTokenPayload) {
  const next: WalletTokenPayload = { ...session };
  delete next.mfaPending;
  await setWalletSessionCookies(response, createWalletToken(next));
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/** 2FA state for this browser's account. */
export async function GET() {
  const { session, wallets } = await readContext();
  const available = twoFactorAvailable();
  if (!session) return json({ available, enabled: false, pending: false, signedIn: false });

  let row: TwoFactorRow | null = null;
  try {
    row = await findTwoFactor(wallets);
  } catch {
    return json({ available: false, enabled: false, pending: false, signedIn: true });
  }
  return json({
    available,
    backupCodesLeft: row?.backup_code_hashes.length ?? 0,
    enabled: Boolean(row),
    pending: Boolean(session.mfaPending && row),
    signedIn: true,
  });
}

export async function POST(request: NextRequest) {
  const { pendingToken, session, wallets } = await readContext();
  if (!session) return jsonError("Sign in first.", 401);
  const owner = session.ownerWallet.toLowerCase();

  if (!(await consumeRateLimit(`two-factor:${owner}`, 30, 60))) {
    return jsonError("Too many attempts. Wait a minute and try again.", 429);
  }

  const body = (await readJsonRecord(request)) ?? {};
  const action = typeof body.action === "string" ? body.action : "";

  let row: TwoFactorRow | null;
  try {
    row = await findTwoFactor(wallets);
  } catch {
    return jsonError("Two-factor authentication isn't available right now.", 503);
  }

  // Finishing a sign-in.
  if (action === "verify") {
    if (!session.mfaPending) return json({ verified: true });
    if (!row) {
      // Turned off since this sign-in started: nothing left to ask for.
      const response = json({ verified: true });
      await clearPendingFlag(response, session);
      return response;
    }
    const input = readCodeInput(body);
    if (!input.code && !input.backupCode) return jsonError("Enter the 6-digit code.", 400);
    const result = await checkCode(row, input);
    const failure = codeFailure(result);
    if (failure) return failure;
    const response = json({
      backupCodesLeft: result.ok ? result.backupCodesLeft : 0,
      usedBackupCode: result.ok && result.usedBackupCode,
      verified: true,
    });
    await clearPendingFlag(response, session);
    return response;
  }

  // Everything below changes 2FA and needs a fully signed-in session.
  if (session.mfaPending) return jsonError("Enter your two-factor code first.", 423);

  if (action === "setup-start") {
    if (!twoFactorAvailable()) {
      return jsonError("Two-factor authentication isn't available yet.", 503);
    }
    if (row) return jsonError("Two-factor authentication is already on.", 409);
    const secret = generateTotpSecret();
    const response = json({
      otpauthUri: otpauthUri(secret, shortWallet(owner)),
      secret: secret.match(/.{1,4}/g)?.join(" ") ?? secret,
    });
    response.cookies.set(
      pendingCookieName,
      createSignedToken({ expiresAt: Date.now() + pendingTtlMs, secret: encryptSecret(secret), wallet: owner }),
      {
        httpOnly: true,
        maxAge: pendingTtlMs / 1000,
        path: "/api/two-factor",
        sameSite: "strict",
        secure: await secureCookieFor(),
      },
    );
    return response;
  }

  if (action === "setup-confirm") {
    if (row) return jsonError("Two-factor authentication is already on.", 409);
    const pending = readSignedToken(pendingToken) as {
      expiresAt?: number;
      secret?: string;
      wallet?: string;
    } | null;
    if (!pending?.secret || pending.wallet !== owner || (pending.expiresAt ?? 0) < Date.now()) {
      return jsonError("Setup timed out. Start again.", 400);
    }
    const input = readCodeInput(body);
    const secret = decryptSecret(pending.secret);
    const step = input.code ? stepForSetup(secret, input.code) : null;
    if (step === null) {
      return jsonError("That code isn't right. Check the time on your phone and try the newest code.", 401);
    }
    const backupCodes = generateBackupCodes();
    try {
      await saveTwoFactor(owner, pending.secret, hashBackupCodes(backupCodes), step);
    } catch {
      return jsonError("Two-factor authentication couldn't be turned on.", 503);
    }
    const response = json({ backupCodes, enabled: true });
    response.cookies.set(pendingCookieName, "", { maxAge: 0, path: "/api/two-factor" });
    return response;
  }

  if (!row) return jsonError("Two-factor authentication is off.", 404);

  if (action === "regenerate-backup-codes") {
    const input = readCodeInput(body);
    if (!input.code) return jsonError("Enter a code from your authenticator app.", 400);
    const failure = codeFailure(await checkCode(row, { code: input.code }));
    if (failure) return failure;
    const backupCodes = generateBackupCodes();
    await replaceBackupCodes(row.owner_wallet, hashBackupCodes(backupCodes));
    return json({ backupCodes });
  }

  if (action === "disable") {
    const input = readCodeInput(body);
    if (!input.code && !input.backupCode) return jsonError("Enter the 6-digit code.", 400);
    const failure = codeFailure(await checkCode(row, input));
    if (failure) return failure;
    await deleteTwoFactor(row.owner_wallet);
    return json({ enabled: false });
  }

  return jsonError("Unknown action.", 400);
}
