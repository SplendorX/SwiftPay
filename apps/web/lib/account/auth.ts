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

export async function requireBusinessAccount(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
}) {
  const context = await requireAuthenticatedAccount(input);
  if (context.account.account_type !== "BUSINESS") {
    throw accountErrors.businessRequired();
  }
  return context;
}
