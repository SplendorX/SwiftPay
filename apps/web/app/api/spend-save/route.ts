import { NextResponse, type NextRequest } from "next/server";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import { swiftSaveVaultAddress } from "@/lib/save/config";
import {
  getPocketForOwner,
  getSpendSaveConfig,
  readSavingsSupabaseError,
  setSpendSaveEnabled,
  upsertSpendSaveConfig,
} from "@/lib/save/service";
import {
  isValidUuid,
  normalizePercentage,
} from "@/lib/save/validation";
import { isSpendSaveEligibleType } from "@/lib/save/types";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
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

  const canAccess = await assertSavingsAccess({
    circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before loading Spend&Save.", 401);
  }

  try {
    const config = await getSpendSaveConfig(ownerWallet);
    const pocket = config
      ? await getPocketForOwner(config.pocket_id, ownerWallet)
      : null;

    return NextResponse.json({
      config,
      pocket,
      vaultAddress: swiftSaveVaultAddress(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Spend&Save could not be loaded.");
    return jsonError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);
  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before configuring Spend&Save.", 401);
  }

  const percentage = normalizePercentage(body.percentage);
  if (!percentage) {
    return jsonError("Percentage must be between 1% and 50%.", 400);
  }

  if (typeof body.pocketId !== "string" || !isValidUuid(body.pocketId)) {
    return jsonError("Select a valid savings pocket.", 400);
  }

  let eligible = "all_outgoing";
  if (typeof body.eligiblePaymentType === "string") {
    if (!isSpendSaveEligibleType(body.eligiblePaymentType)) {
      return jsonError("Invalid eligible payment type.", 400);
    }
    eligible = body.eligiblePaymentType;
  }

  try {
    const config = await upsertSpendSaveConfig({
      ownerWallet,
      percentage,
      pocketId: body.pocketId,
      enabled: body.enabled !== false,
      eligiblePaymentType: eligible,
    });
    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Spend&Save could not be saved.");
    const status = message.includes("active savings") ? 400 : 500;
    return jsonError(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);
  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before updating Spend&Save.", 401);
  }

  const existing = await getSpendSaveConfig(ownerWallet);
  if (!existing) {
    return jsonError("Spend&Save is not configured yet. Use POST to create it.", 404);
  }

  const percentage =
    body.percentage !== undefined
      ? normalizePercentage(body.percentage)
      : String(existing.percentage);

  if (!percentage) {
    return jsonError("Percentage must be between 1% and 50%.", 400);
  }

  const pocketId =
    body.pocketId !== undefined
      ? typeof body.pocketId === "string" && isValidUuid(body.pocketId)
        ? body.pocketId
        : null
      : existing.pocket_id;

  if (!pocketId) {
    return jsonError("Select a valid savings pocket.", 400);
  }

  let eligible = existing.eligible_payment_type;
  if (typeof body.eligiblePaymentType === "string") {
    if (!isSpendSaveEligibleType(body.eligiblePaymentType)) {
      return jsonError("Invalid eligible payment type.", 400);
    }
    eligible = body.eligiblePaymentType;
  }

  try {
    const config = await upsertSpendSaveConfig({
      ownerWallet,
      percentage,
      pocketId,
      enabled:
        body.enabled === undefined ? existing.enabled : body.enabled === true,
      eligiblePaymentType: eligible,
    });
    return NextResponse.json({ config });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Spend&Save could not be updated.");
    return jsonError(message, 500);
  }
}

/** Disable Spend&Save (existing savings remain untouched). */
export async function DELETE(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const data = await request.json();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      body = data as Record<string, unknown>;
    }
  } catch {
    // allow query-param body
  }

  const ownerWallet = normalizeOwnerWallet(
    body.ownerWallet ?? request.nextUrl.searchParams.get("ownerWallet"),
  );
  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid:
      body.circleSocialUuid ??
      request.nextUrl.searchParams.get("circleSocialUuid"),
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before disabling Spend&Save.", 401);
  }

  try {
    const config = await setSpendSaveEnabled(ownerWallet, "disable");
    return NextResponse.json({ config });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Could not disable Spend&Save.");
    const status = message.includes("not configured") ? 404 : 500;
    return jsonError(message, status);
  }
}
