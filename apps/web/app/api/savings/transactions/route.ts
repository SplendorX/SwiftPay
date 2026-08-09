import { NextResponse, type NextRequest } from "next/server";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import {
  listTransactions,
  readSavingsSupabaseError,
} from "@/lib/save/service";
import {
  isSavingsTransactionType,
  type SavingsTransactionType,
} from "@/lib/save/types";
import { isValidUuid } from "@/lib/save/validation";

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
  const pocketId = request.nextUrl.searchParams.get("pocketId") ?? undefined;
  const typeParam = request.nextUrl.searchParams.get("type") ?? undefined;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  if (pocketId && !isValidUuid(pocketId)) {
    return jsonError("Invalid pocket id.", 400);
  }

  let type: SavingsTransactionType | undefined;
  if (typeParam) {
    if (!isSavingsTransactionType(typeParam)) {
      return jsonError("Invalid transaction type.", 400);
    }
    type = typeParam;
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError(
      "Authorize this wallet before loading savings transactions.",
      401,
    );
  }

  try {
    const transactions = await listTransactions(ownerWallet, {
      pocketId,
      type,
      limit: 100,
    });
    return NextResponse.json({ transactions });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Transactions could not be loaded.");
    return jsonError(message, 500);
  }
}
