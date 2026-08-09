import { NextResponse, type NextRequest } from "next/server";

import { syncIncomingPaymentNotifications } from "@/lib/notifications/incoming-payments";
import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import {
  countUnreadSavingsNotifications,
  listSavingsNotifications,
  markSavingsNotificationsRead,
} from "@/lib/save/notifications";

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
  const syncIncoming =
    request.nextUrl.searchParams.get("syncIncoming") !== "0";

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before loading notifications.", 401);
  }

  try {
    let incomingSync = { scanned: 0, created: 0 };
    if (syncIncoming) {
      // Best-effort: index recent ArcScan receives into the bell feed.
      incomingSync = await syncIncomingPaymentNotifications(ownerWallet);
    }

    const [notifications, unreadCount] = await Promise.all([
      listSavingsNotifications(ownerWallet, 40),
      countUnreadSavingsNotifications(ownerWallet),
    ]);
    return NextResponse.json({
      notifications,
      unreadCount,
      incomingSync,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Notifications could not be loaded.";
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

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });
  if (!canAccess) {
    return jsonError("Authorize this wallet before updating notifications.", 401);
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : undefined;

  try {
    await markSavingsNotificationsRead(ownerWallet, ids);
    const unreadCount = await countUnreadSavingsNotifications(ownerWallet);
    return NextResponse.json({ ok: true, unreadCount });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Notifications could not be updated.";
    return jsonError(message, 500);
  }
}
