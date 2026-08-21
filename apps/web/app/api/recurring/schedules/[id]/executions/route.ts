import { NextResponse, type NextRequest } from "next/server";

import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import { loadExecutionsForSchedule } from "@/lib/recurring-service";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const ownerWallet = normalizeOwnerWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  const circleSocialUuid =
    request.nextUrl.searchParams.get("circleSocialUuid") ?? undefined;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before loading executions.", 401);
  }

  try {
    const executions = (await loadExecutionsForSchedule(id)).filter(
      (row) => row.owner_wallet === ownerWallet,
    );
    return NextResponse.json({ executions });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Executions could not be loaded.";
    return jsonError(message, 500);
  }
}
