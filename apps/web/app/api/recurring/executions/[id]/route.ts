import { NextResponse, type NextRequest } from "next/server";

import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const executionsTable =
  process.env.SUPABASE_RECURRING_EXECUTIONS_TABLE ?? "recurring_executions";

type UpdateExecutionBody = {
  circleSocialUuid?: unknown;
  errorMessage?: unknown;
  ownerWallet?: unknown;
  status?: unknown;
  txHash?: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function readSupabaseError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message || "SwiftRecurepay could not update this execution.";
}

function normalizeTxHash(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    return null;
  }

  return value;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: UpdateExecutionBody;

  try {
    body = (await request.json()) as UpdateExecutionBody;
  } catch {
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
    return jsonError("Authorize this wallet before updating executions.", 401);
  }

  if (
    body.status !== "submitted" &&
    body.status !== "confirmed" &&
    body.status !== "failed"
  ) {
    return jsonError("Unsupported execution status.", 400);
  }

  const updates: Record<string, string | null> = {
    attempted_at: new Date().toISOString(),
    status: body.status,
  };

  if (body.status === "confirmed" || body.status === "submitted") {
    const txHash = normalizeTxHash(body.txHash);

    if (!txHash) {
      return jsonError("A transaction hash is required for successful executions.", 400);
    }

    updates.tx_hash = txHash;
    updates.completed_at = new Date().toISOString();
    updates.error_message = null;
  }

  if (body.status === "failed") {
    updates.error_message =
      typeof body.errorMessage === "string" && body.errorMessage.trim()
        ? body.errorMessage.trim().slice(0, 280)
        : "Payment failed.";
    updates.completed_at = new Date().toISOString();
  }

  try {
    const supabase = createSupabaseAdminClient();
    const mutation = await supabase
      .from(executionsTable)
      .update(updates)
      .eq("id", id)
      .eq("owner_wallet", ownerWallet)
      .select("*")
      .single();

    if (mutation.error || !mutation.data) {
      return jsonError(readSupabaseError(mutation.error), 500);
    }

    return NextResponse.json({ execution: mutation.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Execution could not be updated.";

    return jsonError(message, 500);
  }
}