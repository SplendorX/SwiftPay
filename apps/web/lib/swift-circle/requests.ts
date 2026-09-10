import { isValidTxHash, isValidUuid } from "@/lib/save/validation";
import { writeCircleActivity } from "@/lib/swift-circle/activity";
import { writeCircleAudit } from "@/lib/swift-circle/audit";
import {
  assertCircleActive,
  loadCircle,
  requireActiveMember,
} from "@/lib/swift-circle/auth";
import { postFinancialCard } from "@/lib/swift-circle/chat";
import { circleDb, circleTables, isDuplicateError, readCircleDbError } from "@/lib/swift-circle/db";
import { circleErrors } from "@/lib/swift-circle/errors";
import { loadPlatformLimits, assertUnderLimit } from "@/lib/swift-circle/limits";
import { parseAmountUnits, parseUnits, unitsToAmount } from "@/lib/swift-circle/money";
import { emitCircleNotification } from "@/lib/swift-circle/notifications";
import { consumeCircleRateLimit } from "@/lib/swift-circle/rate-limit";
import { assertPermission } from "@/lib/swift-circle/rbac";
import { listActiveMembers } from "@/lib/swift-circle/service";
import { canTransitionRequest } from "@/lib/swift-circle/state";
import type {
  CirclePaymentRequestRecord,
  CircleRequestGroupRecord,
} from "@/lib/swift-circle/types";

function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 128) return null;
  return key;
}

function normalizeReason(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ").slice(0, 140);
  return text || null;
}

export async function createPaymentRequests(input: {
  actorWallet: string;
  circleId: string;
  amount: unknown;
  targetMode: unknown;
  targetWallets?: unknown;
  reason?: unknown;
  expiresInHours?: unknown;
  idempotencyKey?: unknown;
  requestId?: string;
}) {
  consumeCircleRateLimit({ bucket: "REQUEST", wallet: input.actorWallet });
  const circle = await loadCircle(input.circleId);
  assertCircleActive(circle);
  const member = await requireActiveMember(input.circleId, input.actorWallet);
  assertPermission(member, "request");

  const mode =
    input.targetMode === "everyone" || input.targetMode === "multiple"
      ? input.targetMode
      : "one";
  const parsed = parseAmountUnits(input.amount, circle.currency);
  if (!parsed) throw circleErrors.invalid("Enter a valid request amount.");
  const limits = await loadPlatformLimits();
  assertUnderLimit(parsed.units, limits.max_request_amount_units, "Request");

  const members = await listActiveMembers(circle.id);
  const eligible = members.filter(
    (row) => row.user_wallet !== input.actorWallet,
  );
  let targets = eligible;
  if (mode !== "everyone") {
    const wallets = Array.isArray(input.targetWallets)
      ? input.targetWallets
          .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
          .filter(Boolean)
      : [];
    const allowed = new Set(eligible.map((row) => row.user_wallet));
    const selected = [...new Set(wallets)].filter((wallet) => allowed.has(wallet));
    if (selected.length === 0) {
      throw circleErrors.invalid("Select at least one Circle member.");
    }
    if (mode === "one" && selected.length !== 1) {
      throw circleErrors.invalid("Select one member for an individual request.");
    }
    targets = eligible.filter((row) => selected.includes(row.user_wallet));
  }
  if (targets.length === 0) {
    throw circleErrors.invalid("There are no members to request from.");
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (idempotencyKey) {
    const supabase = circleDb();
    const { data: existing } = await supabase
      .from(circleTables.requests)
      .select("*")
      .eq("requester_user_wallet", input.actorWallet)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return { group: null, requests: [existing as CirclePaymentRequestRecord], reused: true };
    }
  }

  let expiresAt: string | null = null;
  if (typeof input.expiresInHours === "number" && input.expiresInHours > 0) {
    expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString();
  } else if (typeof input.expiresInHours === "string") {
    const hours = Number(input.expiresInHours);
    if (Number.isFinite(hours) && hours > 0) {
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }
  }

  const supabase = circleDb();
  const { data: group, error: groupError } = await supabase
    .from(circleTables.requestGroups)
    .insert({
      circle_id: circle.id,
      requester_user_wallet: input.actorWallet,
      per_amount: parsed.amount,
      per_amount_units: parsed.amount_units,
      asset: circle.currency,
      reason: normalizeReason(input.reason),
      target_mode: mode,
      status: "open",
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (groupError) {
    throw new Error(readCircleDbError(groupError, "Could not create request."));
  }

  const rows = targets.map((target, index) => ({
    circle_id: circle.id,
    group_id: group.id,
    requester_user_wallet: input.actorWallet,
    target_user_wallet: target.user_wallet,
    amount: parsed.amount,
    amount_units: parsed.amount_units,
    asset: circle.currency,
    reason: normalizeReason(input.reason),
    status: "pending",
    expires_at: expiresAt,
    idempotency_key:
      idempotencyKey && index === 0 ? idempotencyKey : idempotencyKey
        ? `${idempotencyKey}:${index}`
        : null,
  }));

  const { data: created, error } = await supabase
    .from(circleTables.requests)
    .insert(rows)
    .select("*");
  if (error && isDuplicateError(error) && idempotencyKey) {
    const { data: existing } = await supabase
      .from(circleTables.requests)
      .select("*")
      .eq("requester_user_wallet", input.actorWallet)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return { group, requests: [existing as CirclePaymentRequestRecord], reused: true };
    }
  }
  if (error) {
    throw new Error(readCircleDbError(error, "Could not create request."));
  }

  const requests = (created ?? []) as CirclePaymentRequestRecord[];
  await writeCircleAudit({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    action: "REQUEST_CREATED",
    entityType: "payment_request_group",
    entityId: group.id,
    requestId: input.requestId,
  });
  await writeCircleActivity({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    activityType: "request.created",
    entityType: "payment_request_group",
    entityId: group.id,
    summary: `Requested ${parsed.amount} ${circle.currency} from ${targets.length} member${targets.length === 1 ? "" : "s"}`,
  });
  await postFinancialCard({
    circleId: circle.id,
    actorWallet: input.actorWallet,
    content: `Payment request: ${parsed.amount} ${circle.currency}`,
    metadata: { type: "request", groupId: group.id },
  });
  for (const request of requests) {
    await emitCircleNotification({
      eventId: `circle-request:${request.id}`,
      circleId: circle.id,
      ownerWallet: request.target_user_wallet,
      kind: "circle_request",
      title: "Circle payment request",
      body: `You were asked for ${request.amount} ${request.asset}.`,
      metadata: { requestId: request.id },
    });
  }
  return { group: group as CircleRequestGroupRecord, requests, reused: false };
}

export async function listPaymentRequests(circleId: string) {
  const supabase = circleDb();
  const { data: groups, error } = await supabase
    .from(circleTables.requestGroups)
    .select("*")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load requests."));
  }
  const { data: requests, error: reqError } = await supabase
    .from(circleTables.requests)
    .select("*")
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (reqError) {
    throw new Error(readCircleDbError(reqError, "Could not load requests."));
  }
  const items = (requests ?? []) as CirclePaymentRequestRecord[];
  const now = Date.now();
  for (const row of items) {
    if (
      row.status === "pending" &&
      row.expires_at &&
      Date.parse(row.expires_at) <= now
    ) {
      await supabase
        .from(circleTables.requests)
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");
      row.status = "expired";
    }
  }
  const decoratedGroups = ((groups ?? []) as CircleRequestGroupRecord[]).map(
    (group) => {
      const groupItems = items.filter((item) => item.group_id === group.id);
      const paid = groupItems.filter((item) => item.status === "paid");
      const collected = paid.reduce(
        (sum, item) => sum + parseUnits(item.amount_units),
        0n,
      );
      const total = groupItems.reduce(
        (sum, item) => sum + parseUnits(item.amount_units),
        0n,
      );
      return {
        ...group,
        paid_count: paid.length,
        target_count: groupItems.length,
        collected_units: collected.toString(),
        total_units: total.toString(),
        collected: unitsToAmount(collected, group.asset),
        total: unitsToAmount(total, group.asset),
      };
    },
  );
  return { groups: decoratedGroups, requests: items };
}

export async function payPaymentRequest(input: {
  actorWallet: string;
  requestId: string;
  paymentIntentId?: string | null;
  txHash?: string | null;
  transactionId?: string | null;
}) {
  if (!isValidUuid(input.requestId)) {
    throw circleErrors.invalid("Invalid request id.");
  }
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.requests)
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load request."));
  }
  if (!data) throw circleErrors.notFound("Payment request");
  const request = data as CirclePaymentRequestRecord;
  if (request.target_user_wallet !== input.actorWallet) {
    throw circleErrors.forbidden("You can only pay requests sent to you.");
  }
  if (request.status !== "pending") {
    throw circleErrors.conflict("This request is no longer pending.");
  }
  if (!canTransitionRequest("pending", "paid")) {
    throw circleErrors.conflict("Invalid request state.");
  }
  const { data: updated, error: updateError } = await supabase
    .from(circleTables.requests)
    .update({
      status: "paid",
      payment_intent_id: input.paymentIntentId ?? null,
      tx_hash: isValidTxHash(input.txHash) ? input.txHash : null,
      transaction_id: input.transactionId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (updateError) {
    throw new Error(readCircleDbError(updateError, "Could not mark request paid."));
  }
  if (!updated) throw circleErrors.conflict("This request was already processed.");

  await writeCircleAudit({
    circleId: request.circle_id,
    actorWallet: input.actorWallet,
    action: "REQUEST_PAID",
    entityType: "payment_request",
    entityId: request.id,
  });
  await writeCircleActivity({
    circleId: request.circle_id,
    actorWallet: input.actorWallet,
    activityType: "request.paid",
    entityType: "payment_request",
    entityId: request.id,
    summary: `Paid ${request.amount} ${request.asset}`,
  });
  await postFinancialCard({
    circleId: request.circle_id,
    actorWallet: input.actorWallet,
    content: `Request of ${request.amount} ${request.asset} was paid`,
    metadata: { type: "request_paid", requestId: request.id },
  });
  await emitCircleNotification({
    eventId: `circle-request-paid:${request.id}`,
    circleId: request.circle_id,
    ownerWallet: request.requester_user_wallet,
    kind: "circle_request_paid",
    title: "Request paid",
    body: `Your ${request.amount} ${request.asset} request was paid.`,
  });
  await refreshRequestGroup(request.group_id);
  return updated as CirclePaymentRequestRecord;
}

export async function declinePaymentRequest(input: {
  actorWallet: string;
  requestId: string;
}) {
  if (!isValidUuid(input.requestId)) {
    throw circleErrors.invalid("Invalid request id.");
  }
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.requests)
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load request."));
  }
  if (!data) throw circleErrors.notFound("Payment request");
  const request = data as CirclePaymentRequestRecord;
  const isTarget = request.target_user_wallet === input.actorWallet;
  const isRequester = request.requester_user_wallet === input.actorWallet;
  if (!isTarget && !isRequester) {
    throw circleErrors.forbidden("You cannot modify another user’s request.");
  }
  const next = isRequester ? "cancelled" : "declined";
  if (!canTransitionRequest(request.status, next)) {
    throw circleErrors.conflict("This request cannot be updated.");
  }
  const { data: updated, error: updateError } = await supabase
    .from(circleTables.requests)
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (updateError) {
    throw new Error(readCircleDbError(updateError, "Could not update request."));
  }
  if (!updated) throw circleErrors.conflict("This request was already processed.");
  if (next === "declined") {
    await writeCircleAudit({
      circleId: request.circle_id,
      actorWallet: input.actorWallet,
      action: "REQUEST_DECLINED",
      entityType: "payment_request",
      entityId: request.id,
    });
    await emitCircleNotification({
      eventId: `circle-request-declined:${request.id}`,
      circleId: request.circle_id,
      ownerWallet: request.requester_user_wallet,
      kind: "circle_request_declined",
      title: "Request declined",
      body: `A member declined your ${request.amount} ${request.asset} request.`,
    });
  }
  await refreshRequestGroup(request.group_id);
  return updated as CirclePaymentRequestRecord;
}

async function refreshRequestGroup(groupId: string | null) {
  if (!groupId) return;
  const supabase = circleDb();
  const { data } = await supabase
    .from(circleTables.requests)
    .select("status")
    .eq("group_id", groupId);
  const rows = data ?? [];
  const open = rows.some((row) => row.status === "pending");
  if (!open) {
    await supabase
      .from(circleTables.requestGroups)
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", groupId)
      .eq("status", "open");
  }
}
