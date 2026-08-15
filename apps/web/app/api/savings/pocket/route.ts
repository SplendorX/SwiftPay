import { NextResponse, type NextRequest } from "next/server";

import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import { applyLockChange, parseLockRequest } from "@/lib/save/lock";
import {
  copyFixedLockStarted,
  createSavingsNotificationResult,
} from "@/lib/save/notifications";
import {
  archivePocket,
  getPocketForOwner,
  getPocketStats,
  getSpendSaveConfig,
  readSavingsSupabaseError,
  updatePocket,
} from "@/lib/save/service";
import {
  amountFromUnits,
  isValidUuid,
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

/**
 * Flat pocket detail/update/archive (avoids Turbopack nested [id] 404s).
 * GET ?ownerWallet=&pocketId=
 * PATCH/DELETE body includes pocketId
 */
export async function GET(request: NextRequest) {
  const ownerWallet = normalizeOwnerWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  const pocketId = request.nextUrl.searchParams.get("pocketId");
  const circleSocialUuid =
    request.nextUrl.searchParams.get("circleSocialUuid") ?? undefined;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }
  if (!pocketId || !isValidUuid(pocketId)) {
    return jsonError("A valid pocketId is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before loading this pocket.", 401);
  }

  try {
    const pocket = await getPocketForOwner(pocketId, ownerWallet);
    if (!pocket) {
      return jsonError("Savings pocket not found.", 404);
    }

    const stats = await getPocketStats(pocketId, ownerWallet);
    const spendSave = await getSpendSaveConfig(ownerWallet);
    const linked =
      spendSave && spendSave.pocket_id === pocketId ? spendSave : null;
    const symbol = normalizeCurrency(pocket.currency);

    return NextResponse.json({
      pocket,
      stats: {
        totalDeposits: amountFromUnits(stats.totalDeposits, symbol),
        totalWithdrawals: amountFromUnits(stats.totalWithdrawals, symbol),
        lastDepositAt: stats.lastDepositAt,
      },
      spendSave: linked,
      transactions: stats.transactions,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Pocket could not be loaded.");
    return jsonError(message, 500);
  }
}

export async function PATCH(request: NextRequest) {
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
  if (typeof body.pocketId !== "string" || !isValidUuid(body.pocketId)) {
    return jsonError("A valid pocketId is required.", 400);
  }
  const pocketId = body.pocketId;

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before updating pockets.", 401);
  }

  try {
    const existing = await getPocketForOwner(pocketId, ownerWallet);
    if (!existing) {
      return jsonError("Savings pocket not found.", 404);
    }

    const patch: Parameters<typeof updatePocket>[2] = {};

    if (body.name !== undefined) {
      const name = normalizePocketName(body.name);
      if (!name) {
        return jsonError("Pocket name must be 1–50 characters.", 400);
      }
      patch.name = name;
    }
    if (body.icon !== undefined) {
      patch.icon = normalizeIcon(body.icon);
    }
    if (body.imageUrl !== undefined) {
      patch.image_url = normalizeImageUrl(body.imageUrl);
    }
    if (body.description !== undefined) {
      patch.description = normalizeDescription(body.description);
    }
    if (body.targetAmount !== undefined) {
      const target = normalizeOptionalTarget(
        body.targetAmount,
        existing.currency,
      );
      patch.target_amount = target?.amount ?? null;
      patch.target_amount_units = target?.amount_units ?? null;
    }
    if (body.stopAtTarget !== undefined) {
      patch.stop_at_target = body.stopAtTarget === true;
    }

    const lock = parseLockRequest(body);
    if (!lock.ok) {
      return jsonError(lock.error, 400);
    }
    if (lock.value) {
      const applied = applyLockChange(existing, lock.value);
      if ("error" in applied) {
        return jsonError(applied.error, 400);
      }
      Object.assign(patch, applied.patch);
    }

    const pocket = await updatePocket(pocketId, ownerWallet, patch);

    if (lock.value?.kind === "fixed") {
      const unlock = new Date(lock.value.until).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const copy = copyFixedLockStarted(pocket.name, unlock, lock.value.days);
      await createSavingsNotificationResult({
        ownerWallet,
        kind: "fixed_lock_started",
        fallbackKind: "manual_save_success",
        title: copy.title,
        body: copy.body,
        pocketId: pocket.id,
        relatedTxHash: `lock:${pocket.id}:${lock.value.until}`,
        metadata: {
          type: "fixed_lock_started",
          pocketId: pocket.id,
          lockUntil: lock.value.until,
          lockDays: lock.value.days,
        },
      });
    }

    return NextResponse.json({ pocket });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Pocket could not be updated.");
    const status = message.includes("not found")
      ? 404
      : message.includes("Archived") || message.includes("locked")
        ? 400
        : 500;
    return jsonError(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // allow query params
  }

  const ownerWallet = normalizeOwnerWallet(
    body.ownerWallet ?? request.nextUrl.searchParams.get("ownerWallet"),
  );
  const pocketId =
    (typeof body.pocketId === "string" ? body.pocketId : null) ??
    request.nextUrl.searchParams.get("pocketId");

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }
  if (!pocketId || !isValidUuid(pocketId)) {
    return jsonError("A valid pocketId is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid:
      body.circleSocialUuid ??
      request.nextUrl.searchParams.get("circleSocialUuid"),
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before archiving pockets.", 401);
  }

  try {
    const pocket = await archivePocket(pocketId, ownerWallet);
    return NextResponse.json({ pocket });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : readSavingsSupabaseError(null, "Pocket could not be archived.");
    const status =
      message.includes("not found")
        ? 404
        : message.includes("Withdraw") || message.includes("Spend&Save")
          ? 400
          : 500;
    return jsonError(message, status);
  }
}
