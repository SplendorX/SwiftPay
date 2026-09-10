import { isValidUuid } from "@/lib/save/validation";
import { writeCircleAudit } from "@/lib/swift-circle/audit";
import { requireActiveMember } from "@/lib/swift-circle/auth";
import { circleDb, circleTables, readCircleDbError } from "@/lib/swift-circle/db";
import { circleErrors } from "@/lib/swift-circle/errors";
import { notifyMany } from "@/lib/swift-circle/notifications";
import { loadProfilesByWallets } from "@/lib/swift-circle/profiles";
import { consumeCircleRateLimit } from "@/lib/swift-circle/rate-limit";
import { assertPermission } from "@/lib/swift-circle/rbac";
import { listActiveMemberWallets } from "@/lib/swift-circle/service";
import type { CircleMessageRecord } from "@/lib/swift-circle/types";

export async function listMessages(input: {
  circleId: string;
  before?: string | null;
  limit?: number;
}) {
  const supabase = circleDb();
  let query = supabase
    .from(circleTables.messages)
    .select("*")
    .eq("circle_id", input.circleId)
    .order("created_at", { ascending: false })
    .limit(Math.min(input.limit ?? 50, 100));
  if (input.before) {
    query = query.lt("created_at", input.before);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load messages."));
  }
  const rows = ((data ?? []) as CircleMessageRecord[]).reverse();
  const profiles = await loadProfilesByWallets(
    rows
      .map((row) => row.sender_user_wallet)
      .filter((wallet): wallet is string => Boolean(wallet)),
  );
  return rows.map((row) => {
    const profile = row.sender_user_wallet
      ? profiles.get(row.sender_user_wallet.toLowerCase())
      : null;
    return {
      ...row,
      content: row.deleted_at ? "" : row.content,
      sender_username: profile?.username ?? null,
      sender_display_name: profile?.display_name ?? null,
      sender_avatar_url: profile?.avatar_url ?? null,
    };
  });
}

export async function postMessage(input: {
  actorWallet: string;
  circleId: string;
  content: unknown;
  replyToMessageId?: unknown;
  circleName?: string;
}) {
  consumeCircleRateLimit({ bucket: "CHAT", wallet: input.actorWallet });
  const member = await requireActiveMember(input.circleId, input.actorWallet);
  assertPermission(member, "chat");
  if (typeof input.content !== "string") {
    throw circleErrors.invalid("Message text is required.");
  }
  const content = input.content.trim();
  if (!content) throw circleErrors.invalid("Message text is required.");
  if (content.length > 4000) {
    throw circleErrors.invalid("Message is too long.");
  }
  let replyTo: string | null = null;
  if (typeof input.replyToMessageId === "string" && isValidUuid(input.replyToMessageId)) {
    replyTo = input.replyToMessageId;
  }

  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.messages)
    .insert({
      circle_id: input.circleId,
      sender_user_wallet: input.actorWallet,
      message_type: "text",
      content,
      reply_to_message_id: replyTo,
      delivery_state: "sent",
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not send message."));
  }

  await supabase
    .from(circleTables.messages)
    .update({ delivery_state: "delivered" })
    .eq("id", data.id);

  const members = (await listActiveMemberWallets(input.circleId)).filter(
    (wallet) => wallet !== input.actorWallet,
  );
  await notifyMany(members, {
    eventId: `circle-message:${data.id}`,
    circleId: input.circleId,
    kind: "circle_message",
    title: "New Circle message",
    body: content.slice(0, 140),
    metadata: { messageId: data.id },
  });
  return data as CircleMessageRecord;
}

export async function markRead(input: {
  actorWallet: string;
  circleId: string;
  messageId?: string | null;
}) {
  const supabase = circleDb();
  const { error } = await supabase.from(circleTables.messageReads).upsert(
    {
      circle_id: input.circleId,
      user_wallet: input.actorWallet,
      last_read_message_id: input.messageId ?? null,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "circle_id,user_wallet" },
  );
  if (error) {
    throw new Error(readCircleDbError(error, "Could not update read state."));
  }
}

export async function deleteMessage(input: {
  actorWallet: string;
  circleId: string;
  messageId: string;
}) {
  if (!isValidUuid(input.messageId)) {
    throw circleErrors.invalid("Invalid message id.");
  }
  const member = await requireActiveMember(input.circleId, input.actorWallet);
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.messages)
    .select("*")
    .eq("id", input.messageId)
    .eq("circle_id", input.circleId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load message."));
  }
  if (!data) throw circleErrors.notFound("Message");
  const row = data as CircleMessageRecord;
  const isSender = row.sender_user_wallet === input.actorWallet;
  const isModerator = member.role === "host" || member.role === "admin";
  const ageMs = Date.now() - Date.parse(row.created_at);
  if (!isSender && !isModerator) {
    throw circleErrors.forbidden();
  }
  if (isSender && !isModerator && ageMs > 15 * 60 * 1000) {
    throw circleErrors.forbidden("You can only delete your message within 15 minutes.");
  }
  const { data: updated, error: updateError } = await supabase
    .from(circleTables.messages)
    .update({ deleted_at: new Date().toISOString(), content: "" })
    .eq("id", row.id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (updateError) {
    throw new Error(readCircleDbError(updateError, "Could not delete message."));
  }
  await writeCircleAudit({
    circleId: input.circleId,
    actorWallet: input.actorWallet,
    action: "MESSAGE_DELETED",
    entityType: "message",
    entityId: row.id,
  });
  return updated;
}

export async function reportMessage(input: {
  actorWallet: string;
  circleId: string;
  messageId: string;
  reason: unknown;
}) {
  if (!isValidUuid(input.messageId)) {
    throw circleErrors.invalid("Invalid message id.");
  }
  await requireActiveMember(input.circleId, input.actorWallet);
  const reason =
    typeof input.reason === "string" ? input.reason.trim().slice(0, 280) : "";
  if (!reason) throw circleErrors.invalid("A report reason is required.");
  const supabase = circleDb();
  const { error } = await supabase.from(circleTables.messageReports).insert({
    circle_id: input.circleId,
    message_id: input.messageId,
    reporter_user_wallet: input.actorWallet,
    reason,
  });
  if (error && !(error.message ?? "").toLowerCase().includes("duplicate")) {
    throw new Error(readCircleDbError(error, "Could not report message."));
  }
  await writeCircleAudit({
    circleId: input.circleId,
    actorWallet: input.actorWallet,
    action: "MESSAGE_REPORTED",
    entityType: "message",
    entityId: input.messageId,
    metadata: { reason },
  });
}

export async function postFinancialCard(input: {
  circleId: string;
  content: string;
  metadata: Record<string, unknown>;
  actorWallet?: string | null;
}) {
  const supabase = circleDb();
  await supabase.from(circleTables.messages).insert({
    circle_id: input.circleId,
    sender_user_wallet: input.actorWallet ?? null,
    message_type: "financial_card",
    content: input.content,
    metadata: {
      ...input.metadata,
      actorWallet: input.actorWallet ?? null,
    },
    delivery_state: "delivered",
  });
}
