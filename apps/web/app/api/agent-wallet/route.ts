import { NextResponse, type NextRequest } from "next/server";

import { jsonError, readJsonRecord } from "@/lib/http";
import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import {
  agentWalletBlockchain,
  createAgentWallet,
  createAgentWalletSet,
  getAgentWalletBalances,
  isAgentWalletConfigured,
} from "@/lib/agent-wallet/client";
import {
  loadAgentWalletConfig,
  saveAgentWalletConfig,
  updateAgentWalletStatus,
  type AgentWalletConfig,
} from "@/lib/agent-wallet/config";
import {
  loadPolicyConfigOrDefault,
  savePolicyConfig,
  serializePolicyConfig,
  updatePolicyStatus,
} from "@/lib/payment-engine/policy";

export const runtime = "nodejs";

type AgentWalletBody = {
  circleSocialUuid?: unknown;
  ownerWallet?: unknown;
};

function serializeConfig(config: AgentWalletConfig) {
  return {
    ownerWallet: config.ownerWallet,
    walletSetId: config.walletSetId,
    walletId: config.walletId,
    walletAddress: config.walletAddress,
    blockchain: config.blockchain,
    status: config.status,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

async function authorize(ownerWallet: string, circleSocialUuid: unknown) {
  return assertRecurringAccess({ circleSocialUuid, ownerWallet });
}

export async function POST(request: NextRequest) {
  const body = await readJsonRecord<AgentWalletBody>(request);

  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  if (!(await authorize(ownerWallet, body.circleSocialUuid))) {
    return jsonError("Authorize this wallet before creating ALLIE.", 401);
  }

  if (!isAgentWalletConfigured()) {
    return jsonError(
      "Agent Wallet is not configured on this deployment. Set CIRCLE_DEVELOPER_CONTROLLED_API_KEY and CIRCLE_ENTITY_SECRET.",
      503,
    );
  }

  try {
    const existing = await loadAgentWalletConfig(ownerWallet);

    // Re-activating a revoked wallet is a deliberate owner action; creating a
    // second wallet is not — each user gets exactly one.
    if (existing) {
      if (existing.status === "revoked") {
        await updateAgentWalletStatus(ownerWallet, "active");
        await updatePolicyStatus(ownerWallet, "active");
      }

      const refreshed = await loadAgentWalletConfig(ownerWallet);
      return NextResponse.json({
        agentWallet: serializeConfig(refreshed ?? existing),
        created: false,
      });
    }

    const { walletSetId } = await createAgentWalletSet(ownerWallet);
    const wallet = await createAgentWallet(walletSetId, ownerWallet);

    const now = new Date().toISOString();
    const config: AgentWalletConfig = {
      ownerWallet,
      walletSetId,
      walletId: wallet.walletId,
      walletAddress: wallet.address,
      blockchain: wallet.blockchain || agentWalletBlockchain(),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await saveAgentWalletConfig(config);

    // Seed the conservative default policy so ALLIE is never unbounded.
    const policy = await loadPolicyConfigOrDefault(ownerWallet);
    await savePolicyConfig(policy);

    return NextResponse.json(
      {
        agentWallet: serializeConfig(config),
        created: true,
        policy: serializePolicyConfig(policy),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Agent wallet could not be created.",
      500,
    );
  }
}

export async function GET(request: NextRequest) {
  const ownerWallet = normalizeOwnerWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  const circleSocialUuid =
    request.nextUrl.searchParams.get("circleSocialUuid") ?? undefined;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  if (!(await authorize(ownerWallet, circleSocialUuid))) {
    return jsonError("Authorize this wallet before loading ALLIE.", 401);
  }

  try {
    const config = await loadAgentWalletConfig(ownerWallet);

    if (!config) {
      return NextResponse.json({
        agentWallet: null,
        balances: null,
        configured: isAgentWalletConfigured(),
      });
    }

    let balances: { USDC: string; EURC: string } | null = null;

    try {
      const raw = await getAgentWalletBalances(config.walletId);
      balances = { USDC: raw.USDC.toString(), EURC: raw.EURC.toString() };
    } catch {
      // A balance lookup failure must not hide the wallet itself.
      balances = null;
    }

    return NextResponse.json({
      agentWallet: serializeConfig(config),
      balances,
      configured: isAgentWalletConfigured(),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Agent wallet could not be loaded.",
      500,
    );
  }
}

export async function DELETE(request: NextRequest) {
  const ownerWallet = normalizeOwnerWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  const circleSocialUuid =
    request.nextUrl.searchParams.get("circleSocialUuid") ?? undefined;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  if (!(await authorize(ownerWallet, circleSocialUuid))) {
    return jsonError("Only the owner can revoke ALLIE.", 401);
  }

  try {
    const config = await loadAgentWalletConfig(ownerWallet);

    if (!config) {
      return jsonError("No agent wallet exists for this wallet.", 404);
    }

    // Revoke in both places: the wallet cannot execute, and the policy fails
    // closed even if a stale config is read from somewhere else.
    await updateAgentWalletStatus(ownerWallet, "revoked");
    await updatePolicyStatus(ownerWallet, "revoked");

    return NextResponse.json({ revoked: true });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Agent wallet could not be revoked.",
      500,
    );
  }
}

type PatchBody = AgentWalletBody & { status?: unknown };

/** Pause / resume without tearing the wallet down. */
export async function PATCH(request: NextRequest) {
  const body = await readJsonRecord<PatchBody>(request);

  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  if (!(await authorize(ownerWallet, body.circleSocialUuid))) {
    return jsonError("Only the owner can change ALLIE's status.", 401);
  }

  if (body.status !== "active" && body.status !== "paused") {
    return jsonError("status must be active or paused.", 400);
  }

  try {
    const config = await loadAgentWalletConfig(ownerWallet);

    if (!config) {
      return jsonError("No agent wallet exists for this wallet.", 404);
    }

    if (config.status === "revoked") {
      return jsonError(
        "This agent wallet is revoked. Create a new one to continue.",
        409,
      );
    }

    await updateAgentWalletStatus(ownerWallet, body.status);
    await updatePolicyStatus(ownerWallet, body.status);

    return NextResponse.json({ status: body.status });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Agent wallet status could not be changed.",
      500,
    );
  }
}
