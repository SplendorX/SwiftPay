import { secureCookieFor } from "@/lib/secure-cookie";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { listWalletAddressesForUserToken } from "@/lib/circle-user-server";
import { platformAccessCookieName } from "@/lib/platform-access";
import { walletAuthSessionTtlMs } from "@/lib/wallet-auth";
import {
  createWalletSession,
  createWalletToken,
  readWalletToken,
  walletSessionCookieName,
} from "@/lib/wallet-session";



/**
 * Exchange a Circle user token for SwiftPay's signed wallet session.
 *
 * Only wallets Circle itself reports for the token are added, never an
 * address the browser names, so the session proves control of each wallet.
 * An existing session keeps its wallets and its owner (the wallet the user
 * signed in with). Returns null when the token controls no wallet, e.g. it
 * expired, so callers can treat the exchange as best-effort.
 */
export async function createCircleWalletSession(userToken: string) {
  const wallets = await listWalletAddressesForUserToken(userToken);
  if (wallets.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const session = createWalletSession(
    wallets[0],
    { connectorName: "Circle" },
    {
      additionalWallets: wallets.slice(1),
      keepPreviousOwner: true,
      previous: readWalletToken(
        cookieStore.get(walletSessionCookieName)?.value,
        "session",
      ),
    },
  );
  return { session, token: createWalletToken(session), wallets };
}

export async function setWalletSessionCookies(response: NextResponse, token: string) {
  const secure = await secureCookieFor();
  response.cookies.set(walletSessionCookieName, token, {
    httpOnly: true,
    maxAge: Math.floor(walletAuthSessionTtlMs / 1000),
    path: "/",
    sameSite: "lax",
    secure,
  });
  response.cookies.set(platformAccessCookieName, "1", {
    httpOnly: false,
    maxAge: Math.floor(walletAuthSessionTtlMs / 1000),
    path: "/",
    sameSite: "lax",
    secure,
  });
}
