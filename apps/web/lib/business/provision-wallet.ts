"use client";

import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

import type { WorkspaceSummary } from "@/lib/business/types";
import {
  callCircleWalletApi,
  readCircleLogin,
  type CircleWallet,
} from "@/lib/circle-session";

export function personalCircleWallet(wallets: CircleWallet[]) {
  return wallets[0] ?? null;
}

export function dedicatedBusinessWallet(
  workspace: WorkspaceSummary | null,
  wallets: CircleWallet[],
  ownerWallet?: string | null,
) {
  if (!workspace || workspace.kind !== "business") return null;
  const personal = personalCircleWallet(wallets);
  if (workspace.circleWalletId && workspace.circleWalletId !== personal?.id) {
    const byId = wallets.find((wallet) => wallet.id === workspace.circleWalletId);
    if (byId?.address) return byId;
  }
  const payment = workspace.paymentWallet?.toLowerCase();
  const owner = ownerWallet?.toLowerCase();
  const personalAddress = personal?.address?.toLowerCase();
  if (
    payment &&
    payment !== owner &&
    payment !== personalAddress
  ) {
    return (
      wallets.find((wallet) => wallet.address?.toLowerCase() === payment) ?? null
    );
  }
  return null;
}

export function activeCircleWallet(
  workspace: WorkspaceSummary | null,
  wallets: CircleWallet[],
  ownerWallet?: string | null,
) {
  if (workspace?.kind === "business") {
    return dedicatedBusinessWallet(workspace, wallets, ownerWallet);
  }
  return personalCircleWallet(wallets);
}

export function businessSharesPersonalWallet(
  workspace: WorkspaceSummary | null,
  wallets: CircleWallet[],
  ownerWallet?: string | null,
) {
  if (!workspace || workspace.kind !== "business") return false;
  return !dedicatedBusinessWallet(workspace, wallets, ownerWallet);
}

export async function executeCircleWalletChallenge(challengeId: string) {
  const login = readCircleLogin();
  const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() ?? "";
  if (!login || !appId) {
    throw new Error("Connect a Circle wallet to create a business SCA.");
  }
  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
  const sdk: W3SSdk = new W3SSdk({
    appSettings: { appId },
    authentication: {
      encryptionKey: login.encryptionKey,
      userToken: login.userToken,
    },
  });
  await new Promise<void>((resolve, reject) => {
    sdk.execute(challengeId, (err) => {
      if (err) {
        reject(err instanceof Error ? err : new Error("Wallet confirmation failed."));
        return;
      }
      resolve();
    });
  });
}

function challengeIdFrom(payload: Record<string, unknown>) {
  const direct = payload.challengeId;
  if (typeof direct === "string" && direct) return direct;
  const nested = payload.challenge;
  if (nested && typeof nested === "object" && "id" in nested) {
    const id = (nested as { id?: unknown }).id;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

export async function provisionBusinessScaWallet(input: {
  executeChallenge: (challengeId: string) => Promise<void>;
  existingWalletIds: string[];
  name: string;
  userToken: string;
  workspaceId: string;
}) {
  const created = await callCircleWalletApi<Record<string, unknown>>(
    "createWallet",
    {
      refId: input.workspaceId,
      userToken: input.userToken,
      walletName: input.name,
    },
  );
  const challengeId = challengeIdFrom(created);
  if (challengeId) {
    await input.executeChallenge(challengeId);
  }

  const listed = await callCircleWalletApi<{ wallets?: CircleWallet[] }>(
    "listWallets",
    { userToken: input.userToken },
  );
  const wallets = listed.wallets ?? [];
  const wallet = wallets.find(
    (item) => item.address && !input.existingWalletIds.includes(item.id),
  );
  if (!wallet?.address || !wallet.id) {
    return { address: null, id: null, wallets };
  }
  return { address: wallet.address, id: wallet.id, wallets };
}
