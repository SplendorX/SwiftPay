import { payrollDb, payrollTables } from "@/lib/payroll/db";
import type { PayrollAuditAction } from "@/lib/payroll/types";

export async function logPayrollAudit(input: {
  accountId: string;
  payrollRunId?: string | null;
  action: PayrollAuditAction;
  actorId: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = payrollDb();
    await supabase.from(payrollTables.auditLogs).insert({
      account_id: input.accountId.toLowerCase(),
      payroll_run_id: input.payrollRunId ?? null,
      action: input.action,
      actor_id: input.actorId.toLowerCase(),
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("[payroll-audit] Failed to write audit log:", error);
    // Non-blocking for primary transaction flow but logged
  }
}
