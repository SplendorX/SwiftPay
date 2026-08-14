import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { formatUnitsToDecimal } from "@/lib/save/decimal";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";

const notificationsTable =
  process.env.SUPABASE_SAVINGS_NOTIFICATIONS_TABLE ?? "savings_notifications";

export type SavingsNotificationKind =
  | "manual_save_success"
  | "spend_save_success"
  | "target_reached"
  | "savings_failed"
  | "spend_save_paused"
  | "spend_save_resumed"
  | "spend_save_disabled"
  | "reconciliation_alert"
  | "payment_received"
  | "payment_request"
  | "payment_request_declined"
  | "privswiftpay_claim";

export type SavingsNotificationRecord = {
  id: string;
  owner_wallet: string;
  kind: SavingsNotificationKind;
  title: string;
  body: string;
  pocket_id: string | null;
  transaction_id: string | null;
  related_tx_hash?: string | null;
  metadata?: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type CreateNotificationResult = {
  record: SavingsNotificationRecord | null;
  /** True only when a unique constraint says this event was already stored. */
  alreadyExists: boolean;
  error?: string;
};

export function copyManualSaveSuccess(
  amount: string,
  pocketName: string,
  currency: string,
) {
  return {
    title: "Money saved",
    body: `Nice! $${amount} ${currency} was added to your ${pocketName}.`,
  };
}

export function copySpendSaveSuccess(
  saveAmount: string,
  paymentAmount: string,
  pocketName: string,
  currency: string,
) {
  return {
    title: "Saved while you spent",
    body: `$${saveAmount} ${currency} saved automatically from your $${paymentAmount} payment into ${pocketName}.`,
  };
}

export function copyTargetReached(
  pocketName: string,
  target: string,
  currency: string,
) {
  return {
    title: "Goal reached!",
    body: `You did it! Your ${pocketName} reached $${target} ${currency}.`,
  };
}

export function copySavingsFailed(paymentUnaffected: boolean) {
  return {
    title: "Savings transfer failed",
    body: paymentUnaffected
      ? "We couldn’t complete your savings transfer. Your payment wasn’t affected."
      : "We couldn’t complete your savings transfer. Open Swift+Save to review.",
  };
}

export function copySpendSavePaused() {
  return {
    title: "Spend&Save paused",
    body: "Spend&Save has been paused. Existing savings stay put.",
  };
}

export function copySpendSaveResumed() {
  return {
    title: "Spend&Save resumed",
    body: "We’ll automatically set money aside on your next eligible payment.",
  };
}

export function copySpendSaveDisabled() {
  return {
    title: "Spend&Save turned off",
    body: "No future automatic savings. Your existing pockets are unchanged.",
  };
}

export function copyPaymentReceived(
  amount: string,
  currency: string,
  fromLabel: string,
) {
  return {
    title: "Money received",
    body: `You received $${amount} ${currency} from ${fromLabel}.`,
  };
}

export function copyPaymentRequest(
  amount: string,
  currency: string,
  fromLabel: string,
) {
  return {
    title: "Payment request",
    body: `${fromLabel} requested $${amount} ${currency}.`,
  };
}

export function copyPaymentRequestDeclined(
  amount: string,
  currency: string,
  declinedByLabel: string,
) {
  return {
    title: "Request declined",
    body: `${declinedByLabel} declined your $${amount} ${currency} request.`,
  };
}

function isDuplicateError(error: { message?: string; code?: string }) {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "23505" ||
    message.includes("duplicate") ||
    message.includes("unique")
  );
}

function isKindConstraintError(error: { message?: string; code?: string }) {
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("kind_check") ||
    message.includes("savings_notifications_kind") ||
    (message.includes("check constraint") && message.includes("kind"))
  );
}

/** Extract missing column name from PostgREST / Postgres errors. */
function missingColumnFromError(message: string): string | null {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column [\"']?([\w]+)[\"']? of relation/i,
    /column [\"']?[\w.]*\.?([\w]+)[\"']? does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

type InsertRow = {
  owner_wallet: string;
  kind: string;
  title: string;
  body: string;
  pocket_id?: string | null;
  transaction_id?: string | null;
  related_tx_hash?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function insertNotificationRow(
  row: InsertRow,
): Promise<CreateNotificationResult> {
  try {
    const supabase = createSupabaseAdminClient();
    let current: InsertRow = { ...row };
    // Retry a few times stripping unknown optional columns (live DB may lag migrations).
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data, error } = await supabase
        .from(notificationsTable)
        .insert(current)
        .select("*")
        .single();

      if (!error) {
        return {
          record: data as SavingsNotificationRecord,
          alreadyExists: false,
        };
      }

      if (isDuplicateError(error)) {
        return { record: null, alreadyExists: true };
      }

      const missing = missingColumnFromError(error.message ?? "");
      if (missing && missing in current) {
        console.warn(
          `[swift-save-notify] stripping missing column "${missing}" and retrying`,
        );
        const next = { ...current };
        delete (next as Record<string, unknown>)[missing];
        current = next;
        continue;
      }

      console.warn("[swift-save-notify]", error.message);
      return {
        record: null,
        alreadyExists: false,
        error: error.message,
      };
    }

    return {
      record: null,
      alreadyExists: false,
      error: "Notification insert failed after retries.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "notify failed";
    console.warn("[swift-save-notify]", message);
    return { record: null, alreadyExists: false, error: message };
  }
}

/**
 * Create a notification. Returns structured result so callers can distinguish
 * "already exists" from real insert failures.
 */
export async function createSavingsNotificationResult(input: {
  ownerWallet: string;
  kind: SavingsNotificationKind;
  title: string;
  body: string;
  pocketId?: string | null;
  transactionId?: string | null;
  relatedTxHash?: string | null;
  metadata?: Record<string, unknown> | null;
  /** If kind is rejected by DB check constraint, retry with this kind. */
  fallbackKind?: SavingsNotificationKind;
}): Promise<CreateNotificationResult> {
  // Claim codes are long — do not truncate hard at 500.
  const title = input.title.slice(0, 200);
  const body = input.body.slice(0, 12_000);

  const primary = await insertNotificationRow({
    owner_wallet: input.ownerWallet.toLowerCase(),
    kind: input.kind,
    title,
    body,
    pocket_id: input.pocketId ?? null,
    transaction_id: input.transactionId ?? null,
    related_tx_hash: input.relatedTxHash?.toLowerCase() ?? null,
    metadata: input.metadata ?? {},
  });

  if (primary.record || primary.alreadyExists) {
    return primary;
  }

  if (
    input.fallbackKind &&
    input.fallbackKind !== input.kind &&
    primary.error &&
    isKindConstraintError({ message: primary.error })
  ) {
    console.warn(
      `[swift-save-notify] kind ${input.kind} rejected; falling back to ${input.fallbackKind}`,
    );
    return insertNotificationRow({
      owner_wallet: input.ownerWallet.toLowerCase(),
      kind: input.fallbackKind,
      title,
      body,
      pocket_id: input.pocketId ?? null,
      transaction_id: input.transactionId ?? null,
      related_tx_hash: input.relatedTxHash?.toLowerCase() ?? null,
      metadata: input.metadata ?? {},
    });
  }

  return primary;
}

/** Back-compat: returns the row or null (including already-exists / errors). */
export async function createSavingsNotification(input: {
  ownerWallet: string;
  kind: SavingsNotificationKind;
  title: string;
  body: string;
  pocketId?: string | null;
  transactionId?: string | null;
  relatedTxHash?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const result = await createSavingsNotificationResult(input);
  return result.record;
}

/** Create a payment_received notification if we have not already notified this tx. */
export async function createIncomingPaymentNotification(input: {
  ownerWallet: string;
  title: string;
  body: string;
  relatedTxHash: string;
  metadata?: Record<string, unknown>;
}) {
  return createSavingsNotification({
    ownerWallet: input.ownerWallet,
    kind: "payment_received",
    title: input.title,
    body: input.body,
    relatedTxHash: input.relatedTxHash,
    metadata: input.metadata ?? null,
  });
}

export async function createPaymentRequestNotification(input: {
  amount: string;
  expiresInHours?: number | null;
  fromLabel: string;
  fromUsername?: string | null;
  fromWallet: string;
  metadata?: Record<string, unknown>;
  note?: string | null;
  ownerWallet: string;
  requestId: string;
  requestLink: string;
  token: ArcTokenSymbol;
}) {
  const copy = copyPaymentRequest(input.amount, input.token, input.fromLabel);
  const body = [
    copy.body,
    input.note ? `Note: ${input.note}` : null,
    `PAYMENT_REQUEST_ID:${input.requestId}`,
    `PAYMENT_REQUEST_LINK:${input.requestLink}`,
    `FROM_WALLET:${input.fromWallet.toLowerCase()}`,
    input.fromUsername ? `FROM_USERNAME:${input.fromUsername}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return createSavingsNotificationResult({
    body,
    fallbackKind: "payment_received",
    kind: "payment_request",
    metadata: {
      ...(input.metadata ?? {}),
      amount: input.amount,
      expiresInHours: input.expiresInHours ?? null,
      fromLabel: input.fromLabel,
      fromUsername: input.fromUsername ?? null,
      fromWallet: input.fromWallet.toLowerCase(),
      note: input.note ?? null,
      requestId: input.requestId,
      requestLink: input.requestLink,
      status: "pending",
      token: input.token,
      type: "payment_request",
    },
    ownerWallet: input.ownerWallet,
    relatedTxHash: input.requestId,
    title: copy.title,
  });
}

export async function createPaymentRequestDeclinedNotification(input: {
  amount: string;
  declinedByLabel: string;
  declinedByUsername?: string | null;
  declinedByWallet: string;
  ownerWallet: string;
  requestId: string;
  token: ArcTokenSymbol;
}) {
  const copy = copyPaymentRequestDeclined(
    input.amount,
    input.token,
    input.declinedByLabel,
  );
  const body = [
    copy.body,
    `DECLINED_REQUEST_ID:${input.requestId}`,
    `DECLINED_BY:${input.declinedByWallet.toLowerCase()}`,
    input.declinedByUsername
      ? `DECLINED_BY_USERNAME:${input.declinedByUsername}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return createSavingsNotificationResult({
    body,
    fallbackKind: "payment_received",
    kind: "payment_request_declined",
    metadata: {
      amount: input.amount,
      declinedByLabel: input.declinedByLabel,
      declinedByUsername: input.declinedByUsername ?? null,
      declinedByWallet: input.declinedByWallet.toLowerCase(),
      requestId: input.requestId,
      token: input.token,
      type: "payment_request_declined",
    },
    ownerWallet: input.ownerWallet,
    title: copy.title,
  });
}

export async function getSavingsNotificationById(
  ownerWallet: string,
  id: string,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(notificationsTable)
    .select("*")
    .eq("id", id)
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .maybeSingle();

  if (error) {
    if (
      error.message.toLowerCase().includes("does not exist") ||
      error.message.toLowerCase().includes("permission denied")
    ) {
      return null;
    }
    throw new Error(error.message);
  }

  return (data as SavingsNotificationRecord | null) ?? null;
}

export async function markPaymentRequestNotificationDeclined(input: {
  id: string;
  ownerWallet: string;
}) {
  const existing = await getSavingsNotificationById(input.ownerWallet, input.id);
  if (!existing) {
    return { record: null, error: "Payment request was not found." };
  }

  const metadata = {
    ...((existing.metadata && typeof existing.metadata === "object"
      ? existing.metadata
      : {}) as Record<string, unknown>),
    declinedAt: new Date().toISOString(),
    status: "declined",
  };
  const body = existing.body.includes("DECLINED:1")
    ? existing.body
    : `${existing.body}\nDECLINED:1`;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(notificationsTable)
      .update({
        body,
        metadata,
        read_at: existing.read_at ?? new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("owner_wallet", input.ownerWallet.toLowerCase())
      .select("*")
      .maybeSingle();

    if (!error) {
      return { record: data as SavingsNotificationRecord, error: undefined };
    }

    if (missingColumnFromError(error.message ?? "") === "metadata") {
      const fallback = await supabase
        .from(notificationsTable)
        .update({
          body,
          read_at: existing.read_at ?? new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("owner_wallet", input.ownerWallet.toLowerCase())
        .select("*")
        .maybeSingle();

      if (!fallback.error) {
        return {
          record: fallback.data as SavingsNotificationRecord,
          error: undefined,
        };
      }

      return { record: null, error: fallback.error.message };
    }

    return { record: null, error: error.message };
  } catch (error) {
    return {
      record: null,
      error: error instanceof Error ? error.message : "Decline failed.",
    };
  }
}

/**
 * Extract a PrivSwiftPay claim code from notification metadata or body.
 * Body format used when the DB has no metadata column:
 *   CLAIM_CODE:privswiftpay:...
 */
export function extractClaimCodeFromNotification(
  item: Pick<SavingsNotificationRecord, "body" | "metadata">,
): string | null {
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    const code = (meta as Record<string, unknown>).claimCode;
    if (typeof code === "string" && code.trim().startsWith("privswiftpay:")) {
      return code.trim();
    }
  }

  const body = item.body ?? "";
  const labeled = body.match(/CLAIM_CODE:(privswiftpay:[A-Za-z0-9_-]+)/i);
  if (labeled?.[1]) {
    return labeled[1];
  }
  const bare = body.match(/privswiftpay:[A-Za-z0-9_-]+/i);
  return bare?.[0] ?? null;
}

export function isPrivSwiftPayClaimNotification(
  item: Pick<SavingsNotificationRecord, "kind" | "body" | "metadata">,
): boolean {
  if (item.kind === "privswiftpay_claim") {
    return true;
  }
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    if ((meta as Record<string, unknown>).type === "privswiftpay_claim") {
      return true;
    }
    if ((meta as Record<string, unknown>).claimCode) {
      return true;
    }
  }
  return /CLAIM_CODE:privswiftpay:/i.test(item.body ?? "");
}

export function isPaymentRequestNotification(
  item: Pick<SavingsNotificationRecord, "kind" | "body" | "metadata">,
): boolean {
  if (item.kind === "payment_request_declined") {
    return false;
  }
  if (item.kind === "payment_request") {
    return true;
  }
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    if ((meta as Record<string, unknown>).type === "payment_request_declined") {
      return false;
    }
    if ((meta as Record<string, unknown>).type === "payment_request") {
      return true;
    }
    if ((meta as Record<string, unknown>).requestLink) {
      return true;
    }
  }
  return /PAYMENT_REQUEST_ID:/i.test(item.body ?? "");
}

export function isPaymentRequestDeclinedNotification(
  item: Pick<SavingsNotificationRecord, "kind" | "body" | "metadata">,
): boolean {
  if (item.kind === "payment_request_declined") {
    return true;
  }
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    if ((meta as Record<string, unknown>).type === "payment_request_declined") {
      return true;
    }
  }
  return /DECLINED_REQUEST_ID:/i.test(item.body ?? "");
}

export function isPaymentRequestMarkedDeclined(
  item: Pick<SavingsNotificationRecord, "body" | "metadata">,
): boolean {
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    if ((meta as Record<string, unknown>).status === "declined") {
      return true;
    }
  }
  return /(?:^|\n)DECLINED:1(?:\n|$)/i.test(item.body ?? "");
}

export function isPaymentRequestMarkedPaid(
  item: Pick<SavingsNotificationRecord, "body" | "metadata">,
): boolean {
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    if ((meta as Record<string, unknown>).status === "paid") {
      return true;
    }
  }
  return /(?:^|\n)PAID:1(?:\n|$)/i.test(item.body ?? "");
}

export type PaymentRequestLifecycle = "pending" | "paid" | "declined";

export function getPaymentRequestLifecycle(
  item: Pick<SavingsNotificationRecord, "body" | "metadata">,
): PaymentRequestLifecycle {
  if (isPaymentRequestMarkedPaid(item)) {
    return "paid";
  }
  if (isPaymentRequestMarkedDeclined(item)) {
    return "declined";
  }
  return "pending";
}

export async function findPaymentRequestNotificationsByRequestId(
  requestId: string,
) {
  const id = requestId.trim();
  if (!id) {
    return [] as SavingsNotificationRecord[];
  }

  try {
    const supabase = createSupabaseAdminClient();
    const byMeta = await supabase
      .from(notificationsTable)
      .select("*")
      .eq("metadata->>requestId", id)
      .limit(20);

    if (!byMeta.error && (byMeta.data?.length ?? 0) > 0) {
      return byMeta.data as SavingsNotificationRecord[];
    }

    const byRelated = await supabase
      .from(notificationsTable)
      .select("*")
      .eq("related_tx_hash", id.toLowerCase())
      .limit(20);

    if (!byRelated.error && (byRelated.data?.length ?? 0) > 0) {
      return byRelated.data as SavingsNotificationRecord[];
    }

    const byBody = await supabase
      .from(notificationsTable)
      .select("*")
      .ilike("body", `%PAYMENT_REQUEST_ID:${id}%`)
      .limit(20);

    if (byBody.error || !byBody.data) {
      return [] as SavingsNotificationRecord[];
    }

    return byBody.data as SavingsNotificationRecord[];
  } catch {
    return [] as SavingsNotificationRecord[];
  }
}

export async function readPaymentRequestLifecycle(requestId: string) {
  const rows = await findPaymentRequestNotificationsByRequestId(requestId);
  if (rows.some((row) => getPaymentRequestLifecycle(row) === "paid")) {
    return "paid" as const;
  }
  if (rows.some((row) => getPaymentRequestLifecycle(row) === "declined")) {
    return "declined" as const;
  }
  if (rows.length > 0) {
    return "pending" as const;
  }
  return "unknown" as const;
}

async function updatePaymentRequestRowStatus(input: {
  bodyMarker: "PAID:1" | "DECLINED:1";
  extraMetadata?: Record<string, unknown>;
  record: SavingsNotificationRecord;
  status: "paid" | "declined";
}) {
  const metadata = {
    ...((input.record.metadata && typeof input.record.metadata === "object"
      ? input.record.metadata
      : {}) as Record<string, unknown>),
    ...(input.extraMetadata ?? {}),
    status: input.status,
  };
  const body = input.record.body.includes(input.bodyMarker)
    ? input.record.body
    : `${input.record.body}\n${input.bodyMarker}`;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(notificationsTable)
    .update({
      body,
      metadata,
      read_at: input.record.read_at ?? new Date().toISOString(),
    })
    .eq("id", input.record.id)
    .select("*")
    .maybeSingle();

  if (!error) {
    return data as SavingsNotificationRecord;
  }

  if (missingColumnFromError(error.message ?? "") === "metadata") {
    const fallback = await supabase
      .from(notificationsTable)
      .update({
        body,
        read_at: input.record.read_at ?? new Date().toISOString(),
      })
      .eq("id", input.record.id)
      .select("*")
      .maybeSingle();

    if (!fallback.error) {
      return fallback.data as SavingsNotificationRecord;
    }
  }

  throw new Error(error.message);
}

export async function markPaymentRequestLifecycle(input: {
  ownerWallet?: string;
  paidTxHash?: string | null;
  requestId: string;
  status: "paid" | "declined";
}) {
  const existing = await findPaymentRequestNotificationsByRequestId(
    input.requestId,
  );
  const anyPaid = existing.some(
    (row) => getPaymentRequestLifecycle(row) === "paid",
  );
  if (anyPaid) {
    return { alreadyResolved: true, status: "paid" as const };
  }

  const pending = existing.filter(
    (row) => getPaymentRequestLifecycle(row) === "pending",
  );
  if (existing.length > 0 && pending.length === 0) {
    return { alreadyResolved: true, status: "declined" as const };
  }

  const extraMetadata =
    input.status === "paid"
      ? {
          paidAt: new Date().toISOString(),
          paidTxHash: input.paidTxHash ?? null,
        }
      : { declinedAt: new Date().toISOString() };

  if (pending.length > 0) {
    for (const record of pending) {
      await updatePaymentRequestRowStatus({
        bodyMarker: input.status === "paid" ? "PAID:1" : "DECLINED:1",
        extraMetadata,
        record,
        status: input.status,
      });
    }
    return { alreadyResolved: false, status: input.status };
  }

  if (input.status === "declined") {
    return { alreadyResolved: false, status: "unknown" as const };
  }

  if (!input.ownerWallet) {
    return { alreadyResolved: false, status: "unknown" as const };
  }

  const created = await createSavingsNotificationResult({
    body: [
      "This payment request has been paid.",
      `PAYMENT_REQUEST_ID:${input.requestId}`,
      "PAID:1",
    ].join("\n"),
    fallbackKind: "payment_received",
    kind: "payment_request",
    metadata: {
      paidAt: new Date().toISOString(),
      paidTxHash: input.paidTxHash ?? null,
      requestId: input.requestId,
      status: "paid",
      type: "payment_request",
    },
    ownerWallet: input.ownerWallet,
    relatedTxHash: input.requestId,
    title: "Request paid",
  });

  return {
    alreadyResolved: Boolean(created.alreadyExists),
    status: "paid" as const,
  };
}

export function extractPaymentRequestSenderWallet(
  item: Pick<SavingsNotificationRecord, "body" | "metadata">,
): string | null {
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    const fromWallet = (meta as Record<string, unknown>).fromWallet;
    if (typeof fromWallet === "string" && fromWallet.trim()) {
      return fromWallet.trim().toLowerCase();
    }
  }

  const match = item.body?.match(/FROM_WALLET:(0x[a-fA-F0-9]{40})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function extractPaymentRequestId(
  item: Pick<SavingsNotificationRecord, "body" | "metadata">,
): string | null {
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    const requestId = (meta as Record<string, unknown>).requestId;
    if (typeof requestId === "string" && requestId.trim()) {
      return requestId.trim();
    }
  }

  return item.body?.match(/PAYMENT_REQUEST_ID:(\S+)/i)?.[1] ?? null;
}

/** Dedupe helper when related_tx_hash column is missing. */
export async function hasNotificationForPaymentId(
  ownerWallet: string,
  paymentId: string,
): Promise<boolean> {
  try {
    const supabase = createSupabaseAdminClient();
    const needle = paymentId.toLowerCase();
    const { data, error } = await supabase
      .from(notificationsTable)
      .select("id,body,title")
      .eq("owner_wallet", ownerWallet.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(40);

    if (error || !data) {
      return false;
    }

    return data.some((row) => {
      const text = `${row.title ?? ""}\n${row.body ?? ""}`.toLowerCase();
      return text.includes(needle) || text.includes(`payment_id:${needle}`);
    });
  } catch {
    return false;
  }
}

export async function listSavingsNotifications(
  ownerWallet: string,
  limit = 20,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(notificationsTable)
    .select("*")
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 50));

  if (error) {
    if (
      error.message.toLowerCase().includes("does not exist") ||
      error.message.toLowerCase().includes("permission denied")
    ) {
      return [] as SavingsNotificationRecord[];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as SavingsNotificationRecord[];
}

export async function markSavingsNotificationsRead(
  ownerWallet: string,
  ids?: string[],
) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  let query = supabase
    .from(notificationsTable)
    .update({ read_at: now })
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .is("read_at", null);

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { error } = await query;
  if (error) {
    if (
      error.message.toLowerCase().includes("does not exist") ||
      error.message.toLowerCase().includes("permission denied")
    ) {
      return { updated: 0 };
    }
    throw new Error(error.message);
  }
  return { updated: 1 };
}

export async function countUnreadSavingsNotifications(ownerWallet: string) {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from(notificationsTable)
    .select("id", { count: "exact", head: true })
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .is("read_at", null);

  if (error) {
    if (
      error.message.toLowerCase().includes("does not exist") ||
      error.message.toLowerCase().includes("permission denied")
    ) {
      return 0;
    }
    throw new Error(error.message);
  }
  return count ?? 0;
}

export function formatAmountForCopy(
  units: bigint,
  currency: ArcTokenSymbol,
): string {
  const decimals = arcTestnetTokens[currency].decimals;
  const text = formatUnitsToDecimal(units, decimals);
  const [w, f = ""] = text.split(".");
  return `${w}.${(f + "00").slice(0, 2)}`;
}
