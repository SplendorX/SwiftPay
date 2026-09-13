import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const payrollTables = {
  teamMembers: "payroll_team_members",
  groups: "payroll_groups",
  groupMembers: "payroll_group_members",
  schedules: "payroll_schedules",
  runs: "payroll_runs",
  items: "payroll_items",
  adjustments: "payroll_adjustments",
  executions: "payroll_executions",
  auditLogs: "payroll_audit_logs",
} as const;

export function payrollDb() {
  return createSupabaseAdminClient();
}

export function readPayrollDbError(
  error: { code?: string; message?: string } | null,
  fallback: string,
) {
  const message = error?.message ?? "";
  if (message.toLowerCase().includes("does not exist") || message.toLowerCase().includes("relation")) {
    return "Please run packages/database/supabase/business-payroll.sql in your Supabase SQL editor to create the payroll tables.";
  }
  return message || fallback;
}
