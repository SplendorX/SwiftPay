import { cookies } from "next/headers";
import { getAddress, isAddress } from "viem";
import { assertRecurringAccess } from "@/lib/recurring-auth";
import { readWalletToken, walletSessionCookieName } from "@/lib/wallet-session";

export async function getSessionOwnerWallet(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const session = readWalletToken(
      cookieStore.get(walletSessionCookieName)?.value,
      "session",
    );
    return session?.ownerWallet ? getAddress(session.ownerWallet).toLowerCase() : null;
  } catch {
    return null;
  }
}

export function normalizeReferralWallet(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return null;
  return getAddress(trimmed).toLowerCase();
}

/** Auth failure for referral & OnePoints routes, carrying its HTTP status. */
export class ReferralAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "ReferralAuthError";
    this.status = status;
  }
}

/**
 * Resolves the wallet a referral / OnePoints request acts for. A wallet
 * named in the request is never trusted on its own: the caller must control
 * it (signed session), because these
 * routes spend, gift and redeem that wallet's points.
 *
 * 1. Named wallet (`ownerWallet` / `wallet` / `walletAddress`), if authorized.
 * 2. Otherwise the signed session's wallet.
 */
export async function requireReferralActorWallet(input: {
  ownerWallet?: unknown;
  circleSocialUuid?: unknown;
}): Promise<string> {
  const requestedWallet = normalizeReferralWallet(input.ownerWallet);
  if (requestedWallet) {
    const allowed = await assertRecurringAccess({
      circleSocialUuid: input.circleSocialUuid,
      ownerWallet: requestedWallet,
    });
    if (!allowed) {
      throw new ReferralAuthError(
        "Unauthorized: sign in with this wallet to use its OnePoints.",
      );
    }
    return requestedWallet;
  }

  const sessionWallet = await getSessionOwnerWallet();
  if (sessionWallet) {
    return sessionWallet;
  }

  throw new ReferralAuthError("Unauthorized: sign in to use OnePoints.");
}
