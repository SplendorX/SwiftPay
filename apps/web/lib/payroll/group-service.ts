import { payrollDb, payrollTables, readPayrollDbError } from "@/lib/payroll/db";
import { payrollErrors } from "@/lib/payroll/errors";
import type { PayrollGroupRecord, TeamMemberRecord } from "@/lib/payroll/types";

export async function listPayrollGroups(accountId: string): Promise<PayrollGroupRecord[]> {
  const supabase = payrollDb();
  const { data: groups, error } = await supabase
    .from(payrollTables.groups)
    .select("*")
    .eq("account_id", accountId.toLowerCase())
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(readPayrollDbError(error, "Could not list payroll groups."));
  }

  const { data: memberRows } = await supabase
    .from(payrollTables.groupMembers)
    .select("payroll_group_id, team_member_id");

  const memberMap = new Map<string, string[]>();
  for (const row of memberRows ?? []) {
    const list = memberMap.get(row.payroll_group_id) ?? [];
    list.push(row.team_member_id);
    memberMap.set(row.payroll_group_id, list);
  }

  return (groups ?? []).map((g) => {
    const memberIds = memberMap.get(g.id) ?? [];
    return {
      ...g,
      members_count: memberIds.length,
      member_ids: memberIds,
    };
  });
}

export async function getPayrollGroup(
  accountId: string,
  id: string,
): Promise<PayrollGroupRecord & { members: TeamMemberRecord[] }> {
  const supabase = payrollDb();
  const { data: group, error } = await supabase
    .from(payrollTables.groups)
    .select("*")
    .eq("account_id", accountId.toLowerCase())
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(readPayrollDbError(error, "Could not load payroll group."));
  if (!group) throw payrollErrors.runNotFound("Payroll group was not found.");

  const { data: memberRows } = await supabase
    .from(payrollTables.groupMembers)
    .select("team_member_id")
    .eq("payroll_group_id", id);

  const memberIds = (memberRows ?? []).map((r) => r.team_member_id);
  let members: TeamMemberRecord[] = [];
  if (memberIds.length > 0) {
    const { data: memberData } = await supabase
      .from(payrollTables.teamMembers)
      .select("*")
      .in("id", memberIds);
    members = (memberData ?? []) as TeamMemberRecord[];
  }

  return {
    ...group,
    members_count: members.length,
    member_ids: memberIds,
    members,
  };
}

export async function createPayrollGroup(input: {
  accountId: string;
  name: string;
  description?: string | null;
  defaultSchedule?: string | null;
  memberIds?: string[];
}): Promise<PayrollGroupRecord> {
  const name = input.name.trim();
  if (!name) throw payrollErrors.invalidInput("Group name is required.");

  const supabase = payrollDb();
  const { data: group, error } = await supabase
    .from(payrollTables.groups)
    .insert({
      account_id: input.accountId.toLowerCase(),
      name,
      description: input.description?.trim() || null,
      default_schedule: input.defaultSchedule || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(readPayrollDbError(error, "Could not create payroll group."));

  if (input.memberIds && input.memberIds.length > 0) {
    const rows = input.memberIds.map((memberId) => ({
      payroll_group_id: group.id,
      team_member_id: memberId,
    }));
    await supabase.from(payrollTables.groupMembers).insert(rows);
  }

  return {
    ...group,
    members_count: input.memberIds?.length ?? 0,
    member_ids: input.memberIds ?? [],
  };
}

export async function updatePayrollGroup(
  accountId: string,
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    defaultSchedule?: string | null;
    memberIds?: string[];
  },
): Promise<PayrollGroupRecord> {
  const supabase = payrollDb();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw payrollErrors.invalidInput("Group name cannot be blank.");
    updates.name = name;
  }
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.defaultSchedule !== undefined) updates.default_schedule = patch.defaultSchedule;

  const { data: group, error } = await supabase
    .from(payrollTables.groups)
    .update(updates)
    .eq("account_id", accountId.toLowerCase())
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(readPayrollDbError(error, "Could not update payroll group."));

  if (patch.memberIds !== undefined) {
    await supabase.from(payrollTables.groupMembers).delete().eq("payroll_group_id", id);
    if (patch.memberIds.length > 0) {
      const rows = patch.memberIds.map((memberId) => ({
        payroll_group_id: id,
        team_member_id: memberId,
      }));
      await supabase.from(payrollTables.groupMembers).insert(rows);
    }
  }

  return {
    ...group,
    members_count: patch.memberIds?.length ?? 0,
    member_ids: patch.memberIds ?? [],
  };
}

export async function deletePayrollGroup(accountId: string, id: string): Promise<void> {
  const supabase = payrollDb();
  const { error } = await supabase
    .from(payrollTables.groups)
    .delete()
    .eq("account_id", accountId.toLowerCase())
    .eq("id", id);

  if (error) throw new Error(readPayrollDbError(error, "Could not delete payroll group."));
}
