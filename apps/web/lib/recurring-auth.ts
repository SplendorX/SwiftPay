import { cookies } from "next/headers";
import { getAddress, isAddress } from "viem";

import {
  readWalletToken,
  sessionWallets,
  walletSessionCookieName,
} from "@/lib/wallet-session";

/** Every wallet the browser's signed session vouches for, lowercased. */
export async function getSessionWallets() {
  const cookieStore = await cookies();
  return sessionWallets(
    readWalletToken(cookieStore.get(walletSessionCookieName)?.value, "session"),
  );
}

export async function sessionControlsWallet(wallet: string) {
  return (await getSessionWallets()).includes(wallet.toLowerCase());
}

/**
 * The wallet a request acts for: the one it names when the signed session
 * covers it (a session can hold an external and a Circle wallet), otherwise
 * the session's owner, otherwise the named wallet for the caller to authorize.
 */
export async function resolveSessionActorWallet(requested: unknown) {
  const supplied = normalizeOwnerWallet(requested);
  if (supplied && (await sessionControlsWallet(supplied))) {
    return supplied;
  }
  return (await getSessionOwnerWallet()) ?? supplied;
}

export async function getSessionOwnerWallet() {
  const cookieStore = await cookies();
  const session = readWalletToken(
    cookieStore.get(walletSessionCookieName)?.value,
    "session",
  );

  return session?.ownerWallet?.toLowerCase() ?? null;
}

export function normalizeOwnerWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return getAddress(value).toLowerCase();
}

/**
 * Authorize an owner wallet for sensitive APIs: the browser's signed wallet
 * session must cover it. Circle (Google / email) users get that session from
 * /api/auth/circle at sign-in. The Circle social UUID is not a credential: it
 * used to be accepted here, and it was readable from public profile lookups.
 * `circleSocialUuid` stays in the signature so existing callers compile.
 */
export async function assertRecurringAccess(input: {
  circleSocialUuid?: unknown;
  ownerWallet: string;
}) {
  return sessionControlsWallet(input.ownerWallet);
}
