import { NextResponse, type NextRequest } from "next/server";

import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const executionsTable =
  process.env.SUPABASE_RECURRING_EXECUTIONS_TABLE ?? "recurring_executions";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function readSupabaseError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message || "SwiftRecurepay could not load execution history.";
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

  const canAccess = await assertRecurringAccess({
    circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before loading executions.", 401);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(executionsTable)
      .select("*")
      .eq("owner_wallet", ownerWallet)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return jsonError(readSupabaseError(error), 500);
    }

    return NextResponse.json({ executions: data ?? [] });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Executions could not be loaded.";

    return jsonError(message, 500);
  }
}