import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const circleTables = {
  circles: process.env.SUPABASE_CIRCLES_TABLE ?? "circles",
  members: process.env.SUPABASE_CIRCLE_MEMBERS_TABLE ?? "circle_members",
  invitations:
    process.env.SUPABASE_CIRCLE_INVITATIONS_TABLE ?? "circle_invitations",
  messages: process.env.SUPABASE_CIRCLE_MESSAGES_TABLE ?? "circle_messages",
  messageReads:
    process.env.SUPABASE_CIRCLE_MESSAGE_READS_TABLE ?? "circle_message_reads",
  messageReports:
    process.env.SUPABASE_CIRCLE_MESSAGE_REPORTS_TABLE ??
    "circle_message_reports",
  payments:
    process.env.SUPABASE_CIRCLE_PAYMENT_INTENTS_TABLE ??
    "circle_payment_intents",
  paymentRecipients:
    process.env.SUPABASE_CIRCLE_PAYMENT_RECIPIENTS_TABLE ??
    "circle_payment_recipients",
  requestGroups:
    process.env.SUPABASE_CIRCLE_PAYMENT_REQUEST_GROUPS_TABLE ??
    "circle_payment_request_groups",
  requests:
    process.env.SUPABASE_CIRCLE_PAYMENT_REQUESTS_TABLE ??
    "circle_payment_requests",
  saveAccounts:
    process.env.SUPABASE_CIRCLE_SAVE_ACCOUNTS_TABLE ?? "circle_save_accounts",
  saveContributions:
    process.env.SUPABASE_CIRCLE_SAVE_CONTRIBUTIONS_TABLE ??
    "circle_save_contributions",
  savePockets:
    process.env.SUPABASE_CIRCLE_SAVE_POCKETS_TABLE ?? "circle_save_pockets",
  earnAccounts:
    process.env.SUPABASE_CIRCLE_EARN_ACCOUNTS_TABLE ?? "circle_earn_accounts",
  earnContributions:
    process.env.SUPABASE_CIRCLE_EARN_CONTRIBUTIONS_TABLE ??
    "circle_earn_contributions",
  policies:
    process.env.SUPABASE_CIRCLE_WITHDRAWAL_POLICIES_TABLE ??
    "circle_withdrawal_policies",
  withdrawals:
    process.env.SUPABASE_CIRCLE_WITHDRAWAL_PROPOSALS_TABLE ??
    "circle_withdrawal_proposals",
  approvals:
    process.env.SUPABASE_CIRCLE_WITHDRAWAL_APPROVALS_TABLE ??
    "circle_withdrawal_approvals",
  ledger: process.env.SUPABASE_CIRCLE_LEDGER_TABLE ?? "circle_ledger_entries",
  activity: process.env.SUPABASE_CIRCLE_ACTIVITY_TABLE ?? "circle_activity",
  audit: process.env.SUPABASE_CIRCLE_AUDIT_LOGS_TABLE ?? "circle_audit_logs",
  events: process.env.SUPABASE_CIRCLE_EVENTS_TABLE ?? "circle_events",
  notifications:
    process.env.SUPABASE_CIRCLE_NOTIFICATIONS_TABLE ?? "circle_notifications",
  webhooks:
    process.env.SUPABASE_CIRCLE_WEBHOOK_RECEIPTS_TABLE ??
    "circle_webhook_receipts",
  limits:
    process.env.SUPABASE_CIRCLE_PLATFORM_LIMITS_TABLE ??
    "circle_platform_limits",
  profiles: process.env.SUPABASE_PROFILES_TABLE ?? "profiles",
} as const;

export function circleDb() {
  return createSupabaseAdminClient();
}

export function isDuplicateError(error: { message?: string; code?: string }) {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "23505" ||
    message.includes("duplicate") ||
    message.includes("unique")
  );
}

export function readCircleDbError(
  error: { message?: string } | null,
  fallback: string,
) {
  const message = error?.message ?? "";
  if (message.toLowerCase().includes("permission denied")) {
    return "Supabase rejected access to SwiftCircle tables. Run packages/database/supabase/swift-circle.sql.";
  }
  if (message.toLowerCase().includes("does not exist")) {
    return "Create SwiftCircle tables with packages/database/supabase/swift-circle.sql.";
  }
  return message || fallback;
}
