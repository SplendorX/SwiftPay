import crypto from "node:crypto";

import {
  walletAuthChallengeTtlMs,
  walletAuthSessionTtlMs,
} from "@/lib/wallet-auth";

export const walletChallengeCookieName = "swiftpay_wallet_challenge";
export const walletSessionCookieName = "swiftpay_wallet_session";

type WalletTokenType = "challenge" | "session";

export type WalletTokenPayload = {
  connectorName?: string;
  expiresAt: string;
  issuedAt: string;
  nonce: string;
  ownerWallet: string;
  type: WalletTokenType;
};

function getSessionSecret() {
  const secret =
    process.env.SWIFTPAY_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.CIRCLE_ENTITY_SECRET;

  if (!secret) {
    throw new Error(
      "Set SWIFTPAY_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY for wallet sessions.",
    );
  }

  return secret;
}

function signPayload(encodedPayload: string) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    crypto.timingSafeEqual(firstBuffer, secondBuffer)
  );
}

function isWalletTokenPayload(value: unknown): value is WalletTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.expiresAt === "string" &&
    typeof payload.issuedAt === "string" &&
    typeof payload.nonce === "string" &&
    typeof payload.ownerWallet === "string" &&
    (payload.connectorName === undefined ||
      typeof payload.connectorName === "string") &&
    (payload.type === "challenge" || payload.type === "session")
  );
}

export function createWalletToken(payload: WalletTokenPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function readWalletToken(token: string | undefined, type: WalletTokenType) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature, ...rest] = token.split(".");

  if (!encodedPayload || !signature || rest.length > 0) {
    return null;
  }

  if (!safeEqual(signPayload(encodedPayload), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;

    if (!isWalletTokenPayload(payload) || payload.type !== type) {
      return null;
    }

    if (Date.parse(payload.expiresAt) <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

type WalletSessionMetadata = {
  connectorName?: string;
};

export function createWalletChallenge(
  ownerWallet: string,
  metadata: WalletSessionMetadata = {},
) {
  const now = Date.now();

  return {
    ...metadata,
    expiresAt: new Date(now + walletAuthChallengeTtlMs).toISOString(),
    issuedAt: new Date(now).toISOString(),
    nonce: crypto.randomBytes(16).toString("hex"),
    ownerWallet,
    type: "challenge" as const,
  };
}

export function createWalletSession(
  ownerWallet: string,
  metadata: WalletSessionMetadata = {},
) {
  const now = Date.now();

  return {
    ...metadata,
    expiresAt: new Date(now + walletAuthSessionTtlMs).toISOString(),
    issuedAt: new Date(now).toISOString(),
    nonce: crypto.randomBytes(16).toString("hex"),
    ownerWallet,
    type: "session" as const,
  };
}
