import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { NextResponse, type NextRequest } from "next/server";
import { isAddress, getAddress } from "viem";

import {
  arcAppKitChain,
  DEPOSIT_SOURCE_CHAINS,
  getDepositErrorMessage,
  type DepositSourceChain,
} from "@/lib/deposit-to-arc";
import { loadAgentWalletConfig } from "@/lib/agent-wallet/config";
import { readJsonRecord } from "@/lib/http";
import { isValidUsdcAmount } from "@/lib/onchain-money";
import { getSessionOwnerWallet, sessionControlsWallet } from "@/lib/recurring-auth";

export const runtime = "nodejs";

type TopUpBody = {
  amount?: unknown;
  ownerWallet?: unknown;
  sourceChain?: unknown;
  walletAddress?: unknown;
  walletId?: unknown;
};

type BridgeStep = {
  errorCategory?: string;
  errorMessage?: string;
  explorerUrl?: string;
  name?: string;
  state?: string;
  txHash?: string;
};

type BridgeResult = {
  state?: string;
  steps?: BridgeStep[];
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/**
 * Credentials are read here and nowhere else. Neither the key nor the entity
 * secret is ever placed on a response, and failures quote no part of them.
 */
function readCredentials() {
  const apiKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY?.trim();
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();

  if (!apiKey || !entitySecret) {
    return null;
  }

  return { apiKey, entitySecret };
}

function findSource(value: unknown): DepositSourceChain | null {
  if (typeof value !== "string") {
    return null;
  }

  return (
    DEPOSIT_SOURCE_CHAINS.find(
      (chain) => chain.appKitChain === value || chain.name === value,
    ) ?? null
  );
}

/**
 * Bridge USDC onto Arc for a wallet this deployment signs for.
 *
 * The browser never sees a key: it posts the source chain and an amount, the
 * server signs with the developer-controlled adapter, and only the receipt
 * comes back. `useForwarder` keeps the Arc side gasless, so the destination
 * wallet does not need a balance before it can be topped up.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord<TopUpBody>(request);

  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const credentials = readCredentials();

  if (!credentials) {
    return jsonError(
      "Server-signed top ups are not configured on this deployment. Set CIRCLE_DEVELOPER_CONTROLLED_API_KEY and CIRCLE_ENTITY_SECRET.",
      501,
    );
  }

  const source = findSource(body.sourceChain);

  if (!source) {
    return jsonError("Pick a supported source chain.", 400);
  }

  const amount = typeof body.amount === "string" ? body.amount.trim() : "";

  if (!isValidUsdcAmount(amount)) {
    return jsonError("Enter a USDC amount with up to 6 decimals.", 400);
  }

  const rawWallet =
    typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";

  if (!isAddress(rawWallet)) {
    return jsonError("A valid wallet address is required.", 400);
  }

  const walletAddress = getAddress(rawWallet);

  // The server signs for every developer-controlled wallet, so the request
  // must come from a signed-in owner, and only their own ALLIE agent wallet
  // can be moved: never a wallet the request merely names.
  const requestedOwner =
    typeof body.ownerWallet === "string" && isAddress(body.ownerWallet)
      ? body.ownerWallet.toLowerCase()
      : null;
  const ownerWallet =
    requestedOwner && (await sessionControlsWallet(requestedOwner))
      ? requestedOwner
      : await getSessionOwnerWallet();

  if (!ownerWallet) {
    return jsonError("Sign in before topping up.", 401);
  }

  const agentWallet = await loadAgentWalletConfig(ownerWallet).catch(() => null);

  if (
    !agentWallet ||
    agentWallet.status !== "active" ||
    agentWallet.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
  ) {
    return jsonError("You can only top up your own ALLIE wallet.", 403);
  }

  try {
    const adapter = createCircleWalletsAdapter(credentials);
    const kit = new AppKit();

    const result = (await kit.bridge({
      amount,
      from: {
        adapter,
        address: walletAddress,
        chain: source.appKitChain,
      },
      to: {
        chain: arcAppKitChain(),
        recipientAddress: walletAddress,
        // Circle relays the Arc mint, so the destination needs no gas.
        useForwarder: true,
      },
    })) as BridgeResult;

    const steps = (result.steps ?? []).map((step) => ({
      explorerUrl: step.explorerUrl ?? null,
      name: step.name ?? null,
      state: step.state ?? null,
      txHash: step.txHash ?? null,
    }));

    if (result.state === "error") {
      const failed = result.steps?.find((step) => step.state === "error");
      return NextResponse.json(
        {
          message: getDepositErrorMessage(
            failed?.errorMessage || "Top up to Arc failed.",
          ),
          steps,
        },
        { status: 502 },
      );
    }

    const settled = [...(result.steps ?? [])]
      .reverse()
      .find((step) => step.txHash);

    return NextResponse.json({
      amount,
      explorerUrl: settled?.explorerUrl ?? null,
      sourceChain: source.name,
      state: result.state ?? "unknown",
      steps,
      txHash: settled?.txHash ?? null,
      walletAddress,
    });
  } catch (error) {
    // Circle's own message is safe to surface; the credentials never appear in
    // it, and the depositor needs to know why the top up stopped.
    const message =
      error instanceof Error ? error.message : "Top up to Arc failed.";

    return jsonError(getDepositErrorMessage(message), 502);
  }
}
