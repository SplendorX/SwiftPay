import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

import { formatUsernameLabel } from "@/lib/profile-utils";
import { assertSavingsAccess, normalizeOwnerWallet } from "@/lib/save/auth";
import {
  createPaymentRequestDeclinedNotification,
  extractPaymentRequestId,
  extractPaymentRequestSenderWallet,
  hasNotificationForPaymentId,
  isPaymentRequestMarkedDeclined,
  isPaymentRequestMarkedPaid,
  isPaymentRequestNotification,
  markPaymentRequestLifecycle,
  markPaymentRequestNotificationDeclined,
  getSavingsNotificationById,
} from "@/lib/save/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";

export const runtime = "nodejs";

const profilesTable = process.env.SUPABASE_PROFILES_TABLE ?? "profiles";

type DeclinePaymentRequestBody = {
  circleSocialUuid?: unknown;
  notificationId?: unknown;
  ownerWallet?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function readMetaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeToken(value: unknown): ArcTokenSymbol | null {
  if (typeof value !== "string") {
    return null;
  }

  return value in arcTestnetTokens ? (value as ArcTokenSymbol) : null;
}

export async function POST(request: NextRequest) {
  let body: DeclinePaymentRequestBody;

  try {
    body = (await request.json()) as DeclinePaymentRequestBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);
  const notificationId =
    typeof body.notificationId === "string" ? body.notificationId.trim() : "";

  if (!ownerWallet) {
    return jsonError("Connect a wallet before declining a request.", 400);
  }

  if (!notificationId) {
    return jsonError("A payment request notification is required.", 400);
  }

  const canAccess = await assertSavingsAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before declining a request.", 401);
  }

  try {
    const notification = await getSavingsNotificationById(
      ownerWallet,
      notificationId,
    );

    if (!notification || !isPaymentRequestNotification(notification)) {
      return jsonError("That payment request was not found.", 404);
    }

    if (isPaymentRequestMarkedPaid(notification)) {
      return jsonError("This payment request was already paid.", 409);
    }

    if (isPaymentRequestMarkedDeclined(notification)) {
      return NextResponse.json({ alreadyDeclined: true, ok: true });
    }

    const senderWallet = extractPaymentRequestSenderWallet(notification);
    const requestId = extractPaymentRequestId(notification) ?? notificationId;
    const metadata =
      notification.metadata && typeof notification.metadata === "object"
        ? (notification.metadata as Record<string, unknown>)
        : {};
    const amount = readMetaString(metadata, "amount") ?? "0";
    const token = normalizeToken(metadata.token) ?? "USDC";

    const supabase = createSupabaseAdminClient();
    const { data: decliner } = await supabase
      .from(profilesTable)
      .select("username")
      .eq("wallet_address", ownerWallet)
      .maybeSingle();

    const declinedByUsername =
      typeof decliner?.username === "string" && decliner.username.trim()
        ? decliner.username.trim()
        : null;
    const declinedByLabel = declinedByUsername
      ? formatUsernameLabel(declinedByUsername)
      : "A SwiftPay user";

    const marked = await markPaymentRequestNotificationDeclined({
      id: notificationId,
      ownerWallet,
    });

    if (!marked.record) {
      return jsonError(marked.error ?? "Could not decline this request.", 500);
    }

    await markPaymentRequestLifecycle({
      requestId,
      status: "declined",
    });

    if (senderWallet && isAddress(senderWallet)) {
      const alreadyNotified = await hasNotificationForPaymentId(
        senderWallet,
        `declined_request_id:${requestId}`,
      );

      if (!alreadyNotified) {
        await createPaymentRequestDeclinedNotification({
          amount,
          declinedByLabel,
          declinedByUsername,
          declinedByWallet: ownerWallet,
          ownerWallet: senderWallet,
          requestId,
          token,
        });
      }
    }

    return NextResponse.json({
      notification: marked.record,
      ok: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not decline this request.";
    return jsonError(message, 500);
  }
}
