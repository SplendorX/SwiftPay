import { type NextRequest } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { recordLedgerEntry } from "@/lib/referral/ledger-service";
import { referralDb, referralTables } from "@/lib/referral/db";
import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import crypto from "node:crypto";

export const runtime = "nodejs";

type AdjustBody = {
  walletAddress?: unknown;
  points?: unknown;
  reason?: unknown;
  adminId?: unknown;
};

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return jsonError("Unauthorized admin request.", 401);
  }

  try {
    const body = await readJsonRecord<AdjustBody>(request);
    if (!body) {
      return jsonError("A valid JSON body is required.", 400);
    }

    if (typeof body.walletAddress !== "string" || !body.walletAddress.trim()) {
      return jsonError("A valid wallet address is required.", 400);
    }

    const points = typeof body.points === "number" ? body.points : Number(body.points);
    if (!Number.isFinite(points) || points === 0) {
      return jsonError("A non-zero points adjustment is required.", 400);
    }

    if (typeof body.reason !== "string" || !body.reason.trim()) {
      return jsonError("A documented adjustment reason is mandatory.", 400);
    }

    const adminId = typeof body.adminId === "string" ? body.adminId.trim() : "admin";
    const idempotencyKey = `admin_adj:${body.walletAddress}:${Date.now()}:${crypto.randomBytes(4).toString("hex")}`;

    const ledgerResult = await recordLedgerEntry({
      walletAddress: body.walletAddress,
      entryType: "ADMIN_ADJUSTMENT",
      points,
      idempotencyKey,
      description: `Manual adjustment by admin: ${body.reason.trim()}`,
      createdBy: adminId,
      metadata: {
        adminId,
        reason: body.reason.trim(),
      },
    });

    // Record in Admin Audit Log
    const supabase = referralDb();
    await supabase.from(referralTables.auditLogs).insert({
      admin_id: adminId,
      action: "ADJUST_SWIFTPOINTS",
      target_type: "SWIFTPOINTS_ACCOUNT",
      target_id: ledgerResult.account.id,
      reason: body.reason.trim(),
      changes: {
        adjustedPoints: points,
        ledgerEntryId: ledgerResult.entry.id,
        resultingAvailableUnits: ledgerResult.account.available_balance_units,
      },
    });

    return jsonOk({
      account: ledgerResult.account,
      entry: ledgerResult.entry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not adjust SwiftPoints.";
    return jsonError(message, 500);
  }
}
