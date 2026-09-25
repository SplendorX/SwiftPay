import { secureCookieFor } from "@/lib/secure-cookie";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import {
  circleUserIdForSupabaseUser,
  createEmailSessionToken,
  emailSessionCookieName,
  emailSessionTtlMs,
  issueCircleUserToken,
  listCircleUserWalletAddresses,
  normalizeEmail,
  readEmailSession,
  sendEmailCode,
  verifyEmailCode,
} from "@/lib/email-auth-server";
import { readJsonRecord } from "@/lib/http";
import { sessionControlsWallet } from "@/lib/recurring-auth";
import { platformAccessCookieName } from "@/lib/platform-access";
import { walletAuthSessionTtlMs } from "@/lib/wallet-auth";
import {
  createWalletSession,
  createWalletToken,
  readWalletToken,
  walletSessionCookieName,
} from "@/lib/wallet-session";

export const runtime = "nodejs";


const noStore = { "Cache-Control": "no-store" };

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { headers: noStore, status });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Email sign-in for SwiftPay, backed by Supabase Auth and a Circle
 * user-controlled wallet:
 *   start    → Supabase emails a 6-digit code
 *   verify   → code checked; a Circle user token is issued for the PIN wallet
 *   complete → the wallet is checked against that Circle user, then the same
 *              wallet session an external wallet signature earns is issued
 */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (body.action === "start") {
    const email = normalizeEmail(body.email);
    if (!email) {
      return jsonError("Enter a valid email address.", 400);
    }
    try {
      await sendEmailCode(email);
      return NextResponse.json({ sent: true }, { headers: noStore });
    } catch (error) {
      return jsonError(errorMessage(error, "The sign-in code could not be sent."), 400);
    }
  }

  if (body.action === "verify") {
    const email = normalizeEmail(body.email);
    const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
    if (!email || !/^\d{6,10}$/.test(code)) {
      return jsonError("Enter the code from your email.", 400);
    }

    let circleUserId: string;
    try {
      circleUserId = circleUserIdForSupabaseUser(await verifyEmailCode(email, code));
    } catch (error) {
      return jsonError(errorMessage(error, "That code could not be verified."), 401);
    }

    try {
      const circle = await issueCircleUserToken(circleUserId);
      const response = NextResponse.json(
        { circleUserId, email, ...circle },
        { headers: noStore },
      );
      response.cookies.set(
        emailSessionCookieName,
        createEmailSessionToken({ circleUserId, email }),
        {
          httpOnly: true,
          maxAge: Math.floor(emailSessionTtlMs / 1000),
          path: "/",
          sameSite: "lax",
          secure: await secureCookieFor(),
        },
      );
      return response;
    } catch (error) {
      return jsonError(errorMessage(error, "Your wallet could not be opened."), 502);
    }
  }

  if (body.action === "complete") {
    const cookieStore = await cookies();
    const session = readEmailSession(cookieStore.get(emailSessionCookieName)?.value);
    if (!session) {
      return jsonError("Your email sign-in expired. Enter your email again.", 401);
    }
    if (typeof body.walletAddress !== "string" || !isAddress(body.walletAddress)) {
      return jsonError("A valid wallet address is required.", 400);
    }
    const ownerWallet = getAddress(body.walletAddress);

    try {
      const owned = await listCircleUserWalletAddresses(session.circleUserId);
      if (!owned.includes(ownerWallet.toLowerCase())) {
        return jsonError("That wallet does not belong to this email account.", 403);
      }
    } catch (error) {
      return jsonError(errorMessage(error, "Your wallet could not be verified."), 502);
    }

    const walletSession = createWalletSession(
      ownerWallet,
      { connectorName: "Email" },
      {
        previous: readWalletToken(
          cookieStore.get(walletSessionCookieName)?.value,
          "session",
        ),
      },
    );
    const response = NextResponse.json(
      { authenticated: true, email: session.email, ownerWallet },
      { headers: noStore },
    );
    response.cookies.set(walletSessionCookieName, createWalletToken(walletSession), {
      httpOnly: true,
      maxAge: Math.floor(walletAuthSessionTtlMs / 1000),
      path: "/",
      sameSite: "lax",
      secure: await secureCookieFor(),
    });
    response.cookies.set(platformAccessCookieName, "1", {
      httpOnly: false,
      maxAge: Math.floor(walletAuthSessionTtlMs / 1000),
      path: "/",
      sameSite: "lax",
      secure: await secureCookieFor(),
    });
    response.cookies.delete(emailSessionCookieName);
    return response;
  }

  // An email user's Circle token expires after about an hour, and there is no
  // Circle refresh token for server-issued tokens. Re-issue it, but only to a
  // browser whose signed session already covers one of that user's wallets.
  if (body.action === "refresh") {
    const circleUserId =
      typeof body.circleUserId === "string" ? body.circleUserId.trim() : "";
    if (!/^sp-email-[0-9a-f-]{36}$/i.test(circleUserId)) {
      return jsonError("A valid email wallet id is required.", 400);
    }
    try {
      const owned = await listCircleUserWalletAddresses(circleUserId);
      const covered = await Promise.all(owned.map((wallet) => sessionControlsWallet(wallet)));
      if (!covered.some(Boolean)) {
        return jsonError("Sign in again to continue.", 401);
      }
      const circle = await issueCircleUserToken(circleUserId);
      return NextResponse.json({ circleUserId, ...circle }, { headers: noStore });
    } catch (error) {
      return jsonError(errorMessage(error, "Your wallet session could not be renewed."), 502);
    }
  }

  return jsonError("Unsupported email sign-in action.", 400);
}
