import { requireActorWallet } from "@/lib/business/auth";
import { accountDb, accountTables, readAccountDbError } from "@/lib/account/db";
import { accountErrors } from "@/lib/account/errors";
import type { AccountRecord, AccountType } from "@/lib/account/types";

const accountSelect =
  "wallet_address,username,display_name,avatar_url,bio,locale,account_type_selected,account_type,account_upgraded_at";

export async function loadAccount(wallet: string): Promise<AccountRecord | null> {
  const supabase = accountDb();
  const { data, error } = await supabase
    .from(accountTables.profiles)
    .select(accountSelect)
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();

  if (error) {
    if (/account_type/i.test(error.message ?? "")) {
      const fallback = await supabase
        .from(accountTables.profiles)
        .select(
          "wallet_address,username,display_name,avatar_url,bio,locale,account_type_selected",
        )
        .eq("wallet_address", wallet.toLowerCase())
        .maybeSingle();
      if (fallback.error) {
        throw new Error(readAccountDbError(fallback.error, "Could not load account."));
      }
      if (!fallback.data) return null;
      const row = fallback.data as Omit<
        AccountRecord,
        "account_type" | "account_upgraded_at"
      >;
      return {
        ...row,
        account_type: "PERSONAL",
        account_upgraded_at: null,
      };
    }
    throw new Error(readAccountDbError(error, "Could not load account."));
  }

  if (!data) return null;
  const row = data as Partial<AccountRecord> & AccountRecord;
  return {
    ...row,
    account_type: (row.account_type as AccountType | undefined) ?? "PERSONAL",
    account_upgraded_at: row.account_upgraded_at ?? null,
  };
}

export async function requireAuthenticatedAccount(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
}) {
  const actorWallet = await requireActorWallet(input);
  const account = await loadAccount(actorWallet);
  if (!account) {
    throw accountErrors.invalid("Create your SwiftPay profile before continuing.");
  }
  return { account, actorWallet };
}

export type BusinessAccountAuthContext = {
  account: AccountRecord;
  actorWallet: string;
  businessWallet: string;
  role: "owner" | "admin" | "finance" | "member" | "viewer";
  workspaceId: string | null;
};

export async function requireBusinessAccount(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
  workspaceId?: unknown;
}): Promise<BusinessAccountAuthContext> {
  const context = await requireAuthenticatedAccount(input);

  // One account is either PERSONAL or BUSINESS
  if (context.account.account_type !== "BUSINESS") {
    throw accountErrors.businessRequired();
  }

  return resolveBusinessAccount(context, input.workspaceId);
}

/**
 * For callers that have already authenticated the wallet (ALLIE's chat route):
 * the business context, or null when this is not a Business account.
 */
export async function loadBusinessAccount(
  actorWallet: string,
): Promise<BusinessAccountAuthContext | null> {
  const account = await loadAccount(actorWallet);
  if (!account || account.account_type !== "BUSINESS") return null;
  return resolveBusinessAccount({ account, actorWallet });
}

/** Which wallet the business's records live under: its workspace's, if any. */
async function resolveBusinessAccount(
  context: { account: AccountRecord; actorWallet: string },
  workspaceId?: unknown,
): Promise<BusinessAccountAuthContext> {
  const lowerActor = context.actorWallet.toLowerCase();
  const input = { workspaceId };

  // Check if user owns an active business workspace
  try {
    const { businessDb, businessTables } = await import("@/lib/business/db");
    const supabase = businessDb();

    let query = supabase
      .from(businessTables.workspaces)
      .select("id, kind, owner_user_wallet, payment_wallet, status, name")
      .eq("owner_user_wallet", lowerActor)
      .eq("kind", "business")
      .eq("status", "active");

    if (typeof input.workspaceId === "string" && input.workspaceId.trim()) {
      query = query.eq("id", input.workspaceId.trim());
    }

    const { data: wsRows, error: wsErr } = await query;
    if (!wsErr && wsRows && wsRows.length > 0) {
      const activeWs = wsRows[0];
      const businessWallet = (
        activeWs.payment_wallet || activeWs.owner_user_wallet || lowerActor
      ).toLowerCase();

      const businessAccount =
        (await loadAccount(businessWallet)) || context.account;

      return {
        account: businessAccount,
        actorWallet: lowerActor,
        businessWallet,
        role: "owner",
        workspaceId: activeWs.id,
      };
    }
  } catch (err) {
    console.warn("[requireBusinessAccount] workspace check failed:", err);
  }

  return {
    account: context.account,
    actorWallet: lowerActor,
    businessWallet: lowerActor,
    role: "owner",
    workspaceId: null,
  };
}
