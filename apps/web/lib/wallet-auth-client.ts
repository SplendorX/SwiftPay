export type WalletSessionStatus = {
  authenticated: boolean;
  authMethod?: string;
  connectorName?: string;
  expiresAt?: string;
  ownerWallet?: string;
};

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

  return payload;
}

export async function signInWalletSession(input: {
  connectorName?: string;
  ownerWallet: string;
  signMessage: (message: string) => Promise<string>;
}) {
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

  return verifyPayload;
}