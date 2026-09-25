import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const referralTables = {
  profiles: "referral_profiles",
  attributions: "referral_attributions",
  referrals: "referrals",
  qualifications: "referral_qualifications",
  tierHistory: "referral_tier_history",
  accounts: "swiftpoints_accounts",
  ledger: "swiftpoints_ledger_entries",
  redemptions: "swiftpoints_redemptions",
  activityRewards: "referral_activity_rewards",
  riskAssessments: "referral_risk_assessments",
  auditLogs: "referral_audit_logs",
  progressPayments: "referral_progress_payments",
  entitlements: "swiftpoints_entitlements",
  gifts: "swiftpoints_gifts",
  purchases: "swiftpoints_purchases",
  userProfiles: process.env.SUPABASE_PROFILES_TABLE ?? "profiles",
} as const;

export function referralDb() {
  return createSupabaseAdminClient();
}

export function readReferralDbError(
  error: { code?: string; message?: string } | null,
  fallback: string,
) {
  const message = error?.message ?? "";

  if (message.toLowerCase().includes("permission denied")) {
    return "Supabase rejected access to referral tables. Run packages/database/supabase/referral-and-swiftpoints.sql in your SQL editor.";
  }

  if (message.toLowerCase().includes("does not exist")) {
    return "Create the referral tables with packages/database/supabase/referral-and-swiftpoints.sql before using referrals.";
  }

  if (error?.code === "23505") {
    if (message.toLowerCase().includes("idempotency")) {
      return "This reward operation has already been processed.";
    }
    if (message.toLowerCase().includes("referred_wallet")) {
      return "This account has already been referred.";
    }
    return "Duplicate referral record detected.";
  }

  if (message.toLowerCase().includes("referrals_no_self_referral")) {
    return "Self-referral is prohibited.";
  }

  return message || fallback;
}
