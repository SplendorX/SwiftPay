import { NextResponse, type NextRequest } from "next/server";
import { isAddress, type Address } from "viem";

import { jsonError, readJsonRecord } from "@/lib/http";
import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import {
  fundAgentWallet,
  prepareAgentWalletFunding,
} from "@/lib/agent-wallet/client";
import { loadAgentWalletConfig } from "@/lib/agent-wallet/config";
import {
  isPaymentIntentAsset,
  parseAmountUnits,
} from "@/lib/payment-engine/intent";

export const runtime = "nodejs";

type FundBody = {
  amountUnits?: unknown;
  amountUsdc?: unknown;
  asset?: unknown;
  circleSocialUuid?: unknown;
  fromAddress?: unknown;
  ownerWallet?: unknown;
};

function readAmountUnits(body: FundBody) {
  if (body.amountUnits !== undefined && body.amountUnits !== null) {
    const raw = String(body.amountUnits).trim();
    if (!/^\d+$/.test(raw)) {
      return null;
    }
    const units = BigInt(raw);
    return units > 0n ? units : null;
  }

  return parseAmountUnits(body.amountUsdc);
}

/**
 * Funding moves value out of the user's primary wallet, so it is always
 * user-signed. This endpoint validates the request and returns the exact
 * transfer the client is to submit — the server never holds those keys.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord<FundBody>(request);

  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before funding ALLIE.", 401);
  }

  const amountUnits = readAmountUnits(body);

  if (!amountUnits) {
    return jsonError("A funding amount greater than zero is required.", 400);
  }

  if (body.asset !== undefined && !isPaymentIntentAsset(body.asset)) {
    return jsonError("Asset must be USDC or EURC.", 400);
  }

  const fromAddress =
    typeof body.fromAddress === "string" && isAddress(body.fromAddress)
      ? (body.fromAddress as Address)
      : (ownerWallet as Address);

  try {
    const config = await loadAgentWalletConfig(ownerWallet);

    if (!config) {
      return jsonError("Create an agent wallet before funding it.", 404);
    }

    if (config.status === "revoked") {
      return jsonError("This agent wallet is revoked.", 409);
    }

    await fundAgentWallet(config.walletId, fromAddress, amountUnits);

    const instruction = prepareAgentWalletFunding({
      agentWalletAddress: config.walletAddress,
      fromAddress,
      amountUnits,
      asset: isPaymentIntentAsset(body.asset) ? body.asset : "USDC",
    });

    return NextResponse.json({ funding: instruction });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Funding transfer could not be prepared.",
      500,
    );
  }
}
