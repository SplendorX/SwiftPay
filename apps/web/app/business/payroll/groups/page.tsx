"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Layers,
  Loader2,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { useAccountContext } from "@/components/account/account-provider";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PayrollSubnav } from "@/components/payroll/payroll-subnav";
import {
  createPayrollGroupClient,
  deletePayrollGroupClient,
  fetchPayrollGroups,
  fetchTeamMembers,
} from "@/lib/payroll/client";
import type { PayrollGroupRecord, TeamMemberRecord } from "@/lib/payroll/types";

export default function PayrollGroupsPage() {
  const { ownerWallet, circleSocialUuid } = useAccountContext();
  const [groups, setGroups] = useState<PayrollGroupRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultSchedule, setDefaultSchedule] = useState("MONTHLY");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    if (!ownerWallet) return;
    setLoading(true);
    try {
      const [groupsData, membersData] = await Promise.all([
        fetchPayrollGroups(ownerWallet, circleSocialUuid ?? undefined),
        fetchTeamMembers(ownerWallet, { status: "ACTIVE" }, circleSocialUuid ?? undefined),
      ]);
      setGroups(groupsData);
      setTeamMembers(membersData);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [ownerWallet, circleSocialUuid]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerWallet || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createPayrollGroupClient(
        ownerWallet,
        {
          name: name.trim(),
          description: description.trim() || null,
          defaultSchedule,
          memberIds: selectedMemberIds,
        },
        circleSocialUuid ?? undefined,
      );
      setName("");
      setDescription("");
      setSelectedMemberIds([]);
      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!ownerWallet || !confirm("Are you sure you want to delete this group?")) return;
    try {
      await deletePayrollGroupClient(ownerWallet, id, circleSocialUuid ?? undefined);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete group.");
    }
  }

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Group
            </Button>
            <PlatformProfileControls />
          </div>
        }
        subtitle="Organize team members into departments or regional teams."
        title="Payroll Groups"
      >
        <PayrollSubnav />

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="section-panel p-6 mb-6">
          <p className="text-sm text-muted-foreground">
            Payroll Groups are purely organizational. All payouts originate from your Business wallet, enabling group-based payroll runs (e.g. Engineering, Contractors, Operations).
          </p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            Loading groups…
          </div>
        ) : groups.length === 0 ? (
          <div className="section-panel p-12 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
            <h3 className="font-heading text-lg font-semibold">No Payroll Groups Yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Create groups like "Engineering", "Design", or "Contractors" to organize your payroll runs.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Group
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <div key={group.id} className="section-panel p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-heading font-bold text-lg">{group.name}</h3>
                    <button
                      onClick={() => void handleDeleteGroup(group.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                      title="Delete group"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {group.description ? (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {group.description}
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Users className="h-4 w-4 text-primary" />
                    {group.members_count ?? 0} members
                  </span>
                  <span className="capitalize">{group.default_schedule?.toLowerCase() || "Monthly"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Group Modal */}
        {isModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="font-heading text-lg font-bold">Create Payroll Group</h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateGroup} className="mt-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Group Name *</label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. Engineering Team"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Description</label>
                  <Input
                    className="mt-1"
                    placeholder="Optional department notes"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Default Schedule</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    value={defaultSchedule}
                    onChange={(e) => setDefaultSchedule(e.target.value)}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="BIWEEKLY">Biweekly</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-2">
                    Assign Members ({selectedMemberIds.length} selected)
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-2 border border-border rounded-lg p-3 bg-muted/20">
                    {teamMembers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No active team members available.</p>
                    ) : (
                      teamMembers.map((m) => {
                        const checked = selectedMemberIds.includes(m.id);
                        return (
                          <label
                            key={m.id}
                            className="flex items-center gap-2 text-xs font-medium cursor-pointer hover:text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedMemberIds((prev) => [...prev, m.id]);
                                } else {
                                  setSelectedMemberIds((prev) => prev.filter((i) => i !== m.id));
                                }
                              }}
                              className="rounded border-border"
                            />
                            <span className="truncate">{m.full_name}</span>
                            <span className="text-muted-foreground text-[10px]">({m.role || m.member_type})</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating…" : "Create Group"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
