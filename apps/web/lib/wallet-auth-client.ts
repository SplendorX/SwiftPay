export type WalletSessionStatus = {
  authenticated: boolean;
  authMethod?: string;
  connectorName?: string;
  expiresAt?: string;
  ownerWallet?: string;
};

/** Fired on window when the server wallet session cookie is cleared or replaced. */
export const walletSessionChangedEventName = "swiftpay:wallet-session-changed";

export function notifyWalletSessionChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(walletSessionChangedEventName));
}

export async function fetchWalletSession() {
  const response = await fetch("/api/auth/wallet", { cache: "no-store" });
  const payload = (await response.json()) as WalletSessionStatus & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Wallet session could not be loaded.");
  }

  return payload;
}

export async function endWalletSession() {
  const response = await fetch("/api/auth/wallet", { method: "DELETE" });
  const payload = (await response.json()) as { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? "Wallet session could not be ended.");
  }

  notifyWalletSessionChanged();
  return payload;
}

export type WalletSessionSyncResult = WalletSessionStatus & {
  /** True when an existing session cookie was for a different wallet and was cleared. */
  clearedStaleSession?: boolean;
  previousOwnerWallet?: string;
};

/**
 * Load the server session. If a connected wallet is provided and it does not
 * match the session owner, clear the stale cookie and return unauthenticated.
 */
export async function fetchWalletSessionForAddress(
  connectedWallet?: string | null,
): Promise<WalletSessionSyncResult> {
  const session = await fetchWalletSession();

  if (!session.authenticated || !session.ownerWallet) {
    return { authenticated: false };
  }

  if (!connectedWallet) {
    return session;
  }

  if (session.ownerWallet.toLowerCase() === connectedWallet.toLowerCase()) {
    return session;
  }

  const previousOwnerWallet = session.ownerWallet;

  // Connected wallet changed — drop the previous wallet's session cookie.
  try {
    await endWalletSession();
  } catch {
    // Still treat as signed out for the new wallet.
  }

  return {
    authenticated: false,
    clearedStaleSession: true,
    previousOwnerWallet,
  };
}

export async function signInWalletSession(input: {
  connectorName?: string;
  ownerWallet: string;
  signMessage: (message: string) => Promise<string>;
}) {
  // Drop any previous wallet session before starting a new challenge.
  try {
    const existing = await fetchWalletSession();
    if (
      existing.authenticated &&
      existing.ownerWallet &&
      existing.ownerWallet.toLowerCase() !== input.ownerWallet.toLowerCase()
    ) {
      await endWalletSession();
    }
  } catch {
    // Continue with challenge even if cleanup fails.
  }

  const challengeResponse = await fetch("/api/auth/wallet", {
    body: JSON.stringify({
      action: "challenge",
      connectorName: input.connectorName,
      ownerWallet: input.ownerWallet,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const challengePayload = (await challengeResponse.json()) as {
    message?: string;
    signingMessage?: string;
  };

  if (!challengeResponse.ok || !challengePayload.signingMessage) {
    throw new Error(
      challengePayload.message ?? "Wallet sign-in could not start.",
    );
  }

  const signature = await input.signMessage(challengePayload.signingMessage);
  const verifyResponse = await fetch("/api/auth/wallet", {
    body: JSON.stringify({
      action: "verify",
      signature,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const verifyPayload = (await verifyResponse.json()) as WalletSessionStatus & {
    message?: string;
  };

  if (!verifyResponse.ok || !verifyPayload.authenticated) {
    throw new Error(verifyPayload.message ?? "Wallet sign-in failed.");
  }

  notifyWalletSessionChanged();
  return verifyPayload;
}
