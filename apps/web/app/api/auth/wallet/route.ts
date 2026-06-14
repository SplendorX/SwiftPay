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
      connectorName?: unknown;
      ownerWallet?: unknown;
    }
  | {
      action?: "verify";
      signature?: unknown;
    };

const secureCookie = process.env.NODE_ENV === "production";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { message },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status,
    },
  );
}

function normalizeWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return getAddress(value);
}

function normalizeConnectorName(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const connectorName = value.trim().replace(/\s+/g, " ");

  return connectorName ? connectorName.slice(0, 80) : undefined;
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
    return NextResponse.json(
      { authenticated: false },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      authMethod: "wallet_signature",
      connectorName: session.connectorName,
      expiresAt: session.expiresAt,
      ownerWallet: session.ownerWallet,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
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

    const connectorName = normalizeConnectorName(body.connectorName);
    const challenge = createWalletChallenge(ownerWallet, { connectorName });
    const response = NextResponse.json({
      authMethod: "wallet_signature",
      connectorName,
      expiresAt: challenge.expiresAt,
      ownerWallet,
      signingMessage: buildWalletAuthMessage(challenge),
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
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

  const session = createWalletSession(challenge.ownerWallet, {
    connectorName: challenge.connectorName,
  });
  const response = NextResponse.json({
    authenticated: true,
    authMethod: "wallet_signature",
    connectorName: session.connectorName,
    expiresAt: session.expiresAt,
    ownerWallet: session.ownerWallet,
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
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
  const response = NextResponse.json(
    { authenticated: false },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  response.cookies.delete(walletChallengeCookieName);
  response.cookies.delete(walletSessionCookieName);

  return response;
}
