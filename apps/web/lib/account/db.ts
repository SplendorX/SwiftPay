import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { readBusinessDbError } from "@/lib/business/db";

export const accountTables = {
  history: "account_type_history",
  invoices: "business_invoices",
  invoiceItems: "business_invoice_items",
  invoicePayments: "business_invoice_payments",
  profiles: process.env.SUPABASE_PROFILES_TABLE ?? "profiles",
  businessProfiles: "business_account_profiles",
} as const;

export function accountDb() {
  return createSupabaseAdminClient();
}

export function readAccountDbError(
  error: { code?: string; message?: string } | null,
  fallback: string,
) {
  const message = error?.message ?? "";
  if (message.toLowerCase().includes("does not exist")) {
    return "Run packages/database/supabase/account-business.sql in the Supabase SQL editor.";
  }
  return readBusinessDbError(error, fallback);
}
