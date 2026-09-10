import {
  createSavingsNotificationResult,
  type SavingsNotificationKind,
} from "@/lib/save/notifications";
import { circleDb, circleTables, isDuplicateError } from "@/lib/swift-circle/db";

export type CircleNotifyKind =
  | "circle_invitation"
  | "circle_invitation_accepted"
  | "circle_invitation_declined"
  | "circle_message"
  | "circle_payment"
  | "circle_request"
  | "circle_request_paid"
  | "circle_request_declined"
  | "circle_save"
  | "circle_earn"
  | "circle_withdrawal"
  | "circle_approval"
  | "circle_member"
  | "circle_role"
  | "circle_frozen";

const inboxFallback: Record<CircleNotifyKind, SavingsNotificationKind> = {
  circle_invitation: "payment_request",
  circle_invitation_accepted: "payment_received",
  circle_invitation_declined: "payment_request_declined",
  circle_message: "payment_received",
  circle_payment: "payment_received",
  circle_request: "payment_request",
  circle_request_paid: "payment_received",
  circle_request_declined: "payment_request_declined",
  circle_save: "manual_save_success",
  circle_earn: "manual_save_success",
  circle_withdrawal: "reconciliation_alert",
  circle_approval: "reconciliation_alert",
  circle_member: "payment_received",
  circle_role: "payment_received",
  circle_frozen: "reconciliation_alert",
};

function notificationHref(
  kind: CircleNotifyKind,
  circleId: string,
  metadata?: Record<string, unknown>,
) {
  const invitationId = metadata?.invitationId;
  if (kind === "circle_invitation" && typeof invitationId === "string") {
    return `/swiftCircle?invite=${encodeURIComponent(invitationId)}`;
  }
  return `/swiftCircle/${circleId}`;
}

export async function emitCircleNotification(input: {
  eventId: string;
  circleId: string;
  ownerWallet: string;
  kind: CircleNotifyKind;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = circleDb();
  const eventInsert = await supabase.from(circleTables.events).insert({
    event_id: input.eventId,
    circle_id: input.circleId,
    event_type: input.kind,
    payload: {
      ownerWallet: input.ownerWallet,
      title: input.title,
    },
  });

  if (eventInsert.error && !isDuplicateError(eventInsert.error)) {
    console.warn("[swift-circle-event]", eventInsert.error.message);
  }

  const href = notificationHref(input.kind, input.circleId, input.metadata);
  const notifyInsert = await supabase.from(circleTables.notifications).insert({
    event_id: input.eventId,
    circle_id: input.circleId,
    owner_wallet: input.ownerWallet.toLowerCase(),
    kind: input.kind,
    title: input.title,
    body: input.body,
    metadata: {
      circleId: input.circleId,
      href,
      ...(input.metadata ?? {}),
    },
  });

  if (notifyInsert.error && isDuplicateError(notifyInsert.error)) {
    return { alreadyExists: true as const };
  }

  if (notifyInsert.error) {
    console.warn("[swift-circle-notify]", notifyInsert.error.message);
  }

  try {
    await createSavingsNotificationResult({
      ownerWallet: input.ownerWallet,
      kind: input.kind as SavingsNotificationKind,
      fallbackKind: inboxFallback[input.kind],
      title: input.title,
      body: input.body,
      relatedTxHash: `circle:${input.eventId}`,
      metadata: {
        type: input.kind,
        circleId: input.circleId,
        href,
        ...(input.metadata ?? {}),
      },
    });
  } catch (error) {
    console.warn("[swift-circle-notify-inbox]", error);
  }

  return { alreadyExists: false as const };
}

export async function notifyMany(
  wallets: string[],
  input: Omit<Parameters<typeof emitCircleNotification>[0], "ownerWallet">,
) {
  const unique = [...new Set(wallets.map((wallet) => wallet.toLowerCase()))];
  for (const ownerWallet of unique) {
    await emitCircleNotification({ ...input, ownerWallet });
  }
}
