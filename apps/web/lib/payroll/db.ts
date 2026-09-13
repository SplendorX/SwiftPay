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
  error: { code?: string; details?: string; hint?: string; message?: string; status?: number } | null,
  fallback: string,
) {
  if (error) {
    console.error("[payroll-db-error]", error);
  }
  const message = error?.message ?? "";
  const details = error?.details ?? "";
  const hint = error?.hint ?? "";
  const code = error?.code ?? "";
  const status = error?.status;
  const full = `${code} ${message} ${details} ${hint}`.toLowerCase();

  if (
    full.includes("permission denied") ||
    code === "42501" ||
    status === 403
  ) {
    return "Permission denied for payroll tables. Please run the GRANT statements at the bottom of packages/database/supabase/business-payroll.sql in your Supabase SQL editor.";
  }

  if (
    full.includes("does not exist") ||
    full.includes("relation") ||
    full.includes("schema cache") ||
    full.includes("pgrst205") ||
    code === "42P01" ||
    code === "PGRST205"
  ) {
    return "Please run packages/database/supabase/business-payroll.sql in your Supabase SQL editor to create the payroll tables.";
  }
  return message || fallback;
}
