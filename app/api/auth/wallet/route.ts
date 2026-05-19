import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";

import {
  buildWalletAuthMessage,
  walletAuthChallengeTtlMs,
  walletAuthSessionTtlMs,
} from "@/lib/wallet-auth";
import {
  createWalletChallenge,
  createWalletSession,
  createWalletToken,
  readWalletToken,
  walletChallengeCookieName,
  walletSessionCookieName,
} from "@/lib/wallet-session";

export const runtime = "nodejs";

type WalletAuthBody =
  | {
      action?: "challenge";
      ownerWallet?: unknown;
    }
  | {
      action?: "verify";
      signature?: unknown;
    };

const secureCookie = process.env.NODE_ENV === "production";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function normalizeWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return getAddress(value);
}

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as WalletAuthBody;
  } catch {
    return null;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const session = readWalletToken(
    cookieStore.get(walletSessionCookieName)?.value,
    "session",
  );

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    ownerWallet: session.ownerWallet,
  });
}

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);

  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (body.action === "challenge") {
    const ownerWallet = normalizeWallet(body.ownerWallet);

    if (!ownerWallet) {
      return jsonError("A valid wallet address is required.", 400);
    }

    const challenge = createWalletChallenge(ownerWallet);
    const response = NextResponse.json({
      ownerWallet,
      signingMessage: buildWalletAuthMessage(challenge),
    });

    response.cookies.set(walletChallengeCookieName, createWalletToken(challenge), {
      httpOnly: true,
      maxAge: Math.floor(walletAuthChallengeTtlMs / 1000),
      path: "/",
      sameSite: "lax",
      secure: secureCookie,
    });

    return response;
  }

  if (body.action !== "verify") {
    return jsonError("Unsupported wallet auth action.", 400);
  }

  if (typeof body.signature !== "string" || !body.signature.startsWith("0x")) {
    return jsonError("A wallet signature is required.", 400);
  }

  const cookieStore = await cookies();
  const challenge = readWalletToken(
    cookieStore.get(walletChallengeCookieName)?.value,
    "challenge",
  );

  if (!challenge) {
    return jsonError("Sign-in challenge expired. Please try again.", 400);
  }

  const signatureValid = await verifyMessage({
    address: challenge.ownerWallet as Address,
    message: buildWalletAuthMessage(challenge),
    signature: body.signature as Hex,
  });

  if (!signatureValid) {
    return jsonError("Wallet signature could not be verified.", 401);
  }

  const session = createWalletSession(challenge.ownerWallet);
  const response = NextResponse.json({
    authenticated: true,
    ownerWallet: session.ownerWallet,
  });

  response.cookies.set(walletSessionCookieName, createWalletToken(session), {
    httpOnly: true,
    maxAge: Math.floor(walletAuthSessionTtlMs / 1000),
    path: "/",
    sameSite: "lax",
    secure: secureCookie,
  });
  response.cookies.delete(walletChallengeCookieName);

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });

  response.cookies.delete(walletChallengeCookieName);
  response.cookies.delete(walletSessionCookieName);

  return response;
}
