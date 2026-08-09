import { NextResponse, type NextRequest } from "next/server";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import { getSummary, readSavingsSupabaseError } from "@/lib/save/service";
import { isArcTokenSymbol } from "@/lib/save/validation";
import type { ArcTokenSymbol } from "@/lib/tokens";

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
  const currencyParam =
    request.nextUrl.searchParams.get("currency") ?? "USDC";
  const currency: ArcTokenSymbol = isArcTokenSymbol(currencyParam)
    ? currencyParam
    : "USDC";

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before loading Swift+Save.", 401);
  }

  try {
    const summary = await getSummary(ownerWallet, currency);
    return NextResponse.json({ summary });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Summary could not be loaded.");
    return jsonError(message, 500);
  }
}
