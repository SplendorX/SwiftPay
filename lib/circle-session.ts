"use client";

import { type ArcTokenSymbol } from "@/lib/tokens";

export type CircleOAuthInfo = {
  provider?: string;
  scope?: string[];
  socialUserInfo?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  socialUserUUID?: string;
};

export type CircleLoginResult = {
  encryptionKey: string;
  oAuthInfo?: CircleOAuthInfo;
  refreshToken?: string;
  userToken: string;
};

export type CircleWallet = {
  address?: string;
  blockchain?: string;
  id: string;
  state?: string;
};

export type CircleTokenBalance = {
  amount?: string;
  token?: {
    id?: string;
    name?: string;
    symbol?: string;
  };
};

export type CircleClientErrorPayload = {
  code?: number | string;
  error?: string;
  message?: string;
};

export class CircleClientError extends Error {
  code?: number | string;

  constructor(payload: CircleClientErrorPayload, fallback: string) {
    super(payload.message ?? payload.error ?? fallback);
    this.code = payload.code;
  }
}

export const circleSessionEventName = "swiftpay:circle-session";

export const circleStorageKeys = {
  deviceEncryptionKey: "swiftpay.circle.deviceEncryptionKey",
  deviceId: "swiftpay.circle.deviceId",
  deviceToken: "swiftpay.circle.deviceToken",
  login: "swiftpay.circle.login",
  setupIntent: "swiftpay.circle.setupIntent",
  wallets: "swiftpay.circle.wallets",
};

const circleOAuthStorageKeys = ["socialLoginProvider", "state", "nonce"];

function notifyCircleSessionChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(circleSessionEventName));
}

export function readCircleSessionStorage(key: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(key) ?? "";
}

export function writeCircleSessionStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(key, value);
}

export function removeCircleSessionStorage(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(key);
}

export function readCircleLogin() {
  const raw = readCircleSessionStorage(circleStorageKeys.login);

  if (!raw) {
    return null;
  }

  try {
    const login = JSON.parse(raw) as Partial<CircleLoginResult>;

    return login.userToken && login.encryptionKey
      ? ({
          ...login,
          encryptionKey: login.encryptionKey,
          userToken: login.userToken,
        } satisfies CircleLoginResult)
      : null;
  } catch {
    return null;
  }
}

export function writeCircleLogin(login: CircleLoginResult) {
  writeCircleSessionStorage(circleStorageKeys.login, JSON.stringify(login));
  notifyCircleSessionChanged();
}

export function readCircleWallets() {
  const raw = readCircleSessionStorage(circleStorageKeys.wallets);

  if (!raw) {
    return [];
  }

  try {
    const wallets = JSON.parse(raw) as CircleWallet[];

    return Array.isArray(wallets)
      ? wallets.filter(
          (wallet): wallet is CircleWallet =>
            typeof wallet?.id === "string" && wallet.id.trim().length > 0,
        )
      : [];
  } catch {
    return [];
  }
}

export function writeCircleWallets(wallets: CircleWallet[]) {
  writeCircleSessionStorage(circleStorageKeys.wallets, JSON.stringify(wallets));
  notifyCircleSessionChanged();
}

export function clearCircleSession(options: { clearDevice?: boolean } = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const clearDevice = options.clearDevice ?? true;
  window.sessionStorage.removeItem(circleStorageKeys.login);
  window.sessionStorage.removeItem(circleStorageKeys.setupIntent);
  window.sessionStorage.removeItem(circleStorageKeys.wallets);

  if (clearDevice) {
    window.sessionStorage.removeItem(circleStorageKeys.deviceEncryptionKey);
    window.sessionStorage.removeItem(circleStorageKeys.deviceId);
    window.sessionStorage.removeItem(circleStorageKeys.deviceToken);
  }

  circleOAuthStorageKeys.forEach((key) => {
    window.localStorage.removeItem(key);
  });

  notifyCircleSessionChanged();
}

export function getCircleLoginIdentity(login?: CircleLoginResult | null) {
  const userInfo = login?.oAuthInfo?.socialUserInfo;

  return {
    email: userInfo?.email,
    name: userInfo?.name,
    provider: login?.oAuthInfo?.provider ?? "Google",
    socialUserUUID: login?.oAuthInfo?.socialUserUUID,
  };
}

export function shortenCircleAddress(value?: string, fallback = "Not connected") {
  if (!value) {
    return fallback;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function getCircleErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const payload = error as Error & CircleClientErrorPayload;

    return payload.code ? `[${payload.code}] ${error.message}` : error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const payload = error as CircleClientErrorPayload;
    const message = payload.message ?? payload.error;

    if (message) {
      return payload.code ? `[${payload.code}] ${message}` : message;
    }
  }

  return fallback;
}

export async function callCircleWalletApi<T>(
  action: string,
  params: Record<string, unknown> = {},
) {
  const response = await fetch("/api/circle/user-wallets", {
    body: JSON.stringify({
      action,
      ...params,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();
  let payload: T & CircleClientErrorPayload;

  try {
    payload = text
      ? (JSON.parse(text) as T & CircleClientErrorPayload)
      : ({} as T & CircleClientErrorPayload);
  } catch {
    payload = {
      message: text || "Circle wallet request returned a non-JSON response.",
    } as T & CircleClientErrorPayload;
  }

  if (!response.ok) {
    throw new CircleClientError(payload, "Circle wallet request failed.");
  }

  return payload;
}

export function findCircleTokenBalance(
  balances: CircleTokenBalance[],
  symbol: ArcTokenSymbol,
) {
  return balances.find((balance) => {
    const tokenSymbol = balance.token?.symbol?.toUpperCase();
    const tokenName = balance.token?.name?.toUpperCase();

    return tokenSymbol === symbol || tokenName?.includes(symbol);
  });
}
