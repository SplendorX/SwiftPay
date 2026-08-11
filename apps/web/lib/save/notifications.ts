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
    body: `${fromLabel} requested $${amount} ${currency}. Open the request to review and pay.`,
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
      note: input.note ?? null,
      requestId: input.requestId,
      requestLink: input.requestLink,
      token: input.token,
      type: "payment_request",
    },
    ownerWallet: input.ownerWallet,
    title: copy.title,
  });
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
  if (item.kind === "payment_request") {
    return true;
  }
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    if ((meta as Record<string, unknown>).type === "payment_request") {
      return true;
    }
    if ((meta as Record<string, unknown>).requestLink) {
      return true;
    }
  }
  return /PAYMENT_REQUEST_ID:/i.test(item.body ?? "");
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
