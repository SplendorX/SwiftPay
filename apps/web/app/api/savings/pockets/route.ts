import { NextResponse, type NextRequest } from "next/server";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import {
  createPocket,
  listPockets,
  readSavingsSupabaseError,
} from "@/lib/save/service";
import {
  normalizeCurrency,
  normalizeDescription,
  normalizeIcon,
  normalizeImageUrl,
  normalizeOptionalTarget,
  normalizePocketName,
} from "@/lib/save/validation";

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
  const includeArchived =
    request.nextUrl.searchParams.get("includeArchived") === "1";

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before loading pockets.", 401);
  }

  try {
    const pockets = await listPockets(ownerWallet, { includeArchived });
    return NextResponse.json({ pockets });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Pockets could not be loaded.");
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

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);
  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before creating pockets.", 401);
  }

  const name = normalizePocketName(body.name);
  if (!name) {
    return jsonError("Pocket name must be 1–50 characters.", 400);
  }

  const currency = normalizeCurrency(body.currency);
  const target = normalizeOptionalTarget(body.targetAmount, currency);

  try {
    const pocket = await createPocket({
      ownerWallet,
      name,
      icon: normalizeIcon(body.icon),
      imageUrl: normalizeImageUrl(body.imageUrl),
      description: normalizeDescription(body.description),
      targetAmount: target?.amount ?? null,
      targetAmountUnits: target?.amount_units ?? null,
      currency,
      stopAtTarget: body.stopAtTarget === true,
    });

    return NextResponse.json({ pocket }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Pocket could not be created.");
    const status = message.includes("at most") ? 400 : 500;
    return jsonError(message, status);
  }
}
