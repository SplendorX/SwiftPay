"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Layers,
  Loader2,
  Plus,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

import { useAccountContext } from "@/components/account/account-provider";
import { useWorkspace } from "@/components/business/workspace-provider";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PayrollFormSheet } from "@/components/payroll/payroll-form-sheet";
import {
  createPayrollGroupClient,
  deletePayrollGroupClient,
  fetchPayrollGroups,
  fetchTeamMembers,
} from "@/lib/payroll/client";
import type { PayrollGroupRecord, TeamMemberRecord } from "@/lib/payroll/types";

import "../payroll.css";

export default function PayrollGroupsPage() {
  const { ownerWallet, circleSocialUuid } = useAccountContext();
  const { workspace } = useWorkspace();
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
        fetchPayrollGroups(ownerWallet, circleSocialUuid ?? undefined, workspace?.id),
        fetchTeamMembers(ownerWallet, { status: "ACTIVE" }, circleSocialUuid ?? undefined, workspace?.id),
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
  }, [ownerWallet, circleSocialUuid, workspace?.id]);

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
        workspace?.id,
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
      await deletePayrollGroupClient(ownerWallet, id, circleSocialUuid ?? undefined, workspace?.id);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete group.");
    }
  }

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The page draws its own bar with a back button.
        hideHeader
        subtitle="Organize team members into departments or regional teams."
        title="Payroll Groups"
      >
        <div className="pr-page">
          <header className="pr-bar">
            <Link aria-label="Back to payroll" className="pr-round" href="/business/payroll">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="pr-title">Groups</h1>
            <button
              aria-label="Create group"
              className="pr-round is-primary"
              onClick={() => setIsModalOpen(true)}
              title="Create group"
              type="button"
            >
              <Plus className="h-5 w-5" />
            </button>
          </header>

          {error ? (
            <div className="pr-alert" role="alert">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{error}</span>
            </div>
          ) : null}

          <p className="pr-note">
            <Layers className="h-4 w-4 shrink-0" />
            Groups only organise your team, e.g. Engineering, Contractors or Operations, so you can run payroll for one
            group at a time. Every payout still comes from your Business wallet.
          </p>

          <section className="pr-card">
            <div className="pr-card-head">
              <div>
                <h2>Teams &amp; departments</h2>
                <p>Groups for targeted payroll runs</p>
              </div>
              <span className="pr-count">{groups.length}</span>
            </div>

            {loading ? (
              <p className="pr-empty">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading groups…
              </p>
            ) : groups.length === 0 ? (
              <div className="pr-empty is-first">
                <span aria-hidden className="pr-empty-icon">
                  <Layers className="h-7 w-7" />
                </span>
                <p className="pr-empty-title">No payroll groups yet</p>
                <p>Create groups like &ldquo;Engineering&rdquo;, &ldquo;Design&rdquo; or &ldquo;Contractors&rdquo; to organise your payroll runs.</p>
                <Button className="mt-2 h-11 rounded-xl" onClick={() => setIsModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Create group
                </Button>
              </div>
            ) : (
              <ul className="pr-runs">
                {groups.map((group) => (
                  <li key={group.id}>
                    <div className="pr-run">
                      <span className="pr-avatar">
                        <Layers className="h-5 w-5" />
                      </span>
                      <span className="pr-run-main">
                        <span className="pr-run-title">{group.name}</span>
                        <span className="pr-run-sub">
                          {group.description || "No description"}
                        </span>
                      </span>
                      <span className="pr-run-side">
                        <span className="pr-run-amount">
                          <Users className="mr-1 inline h-3.5 w-3.5" />
                          {group.members_count ?? 0}
                        </span>
                        <span className="pr-run-sub">
                          {frequencyLabel(group.default_schedule)}
                        </span>
                      </span>
                      <button
                        aria-label={`Delete ${group.name}`}
                        className="pr-icon-button is-danger"
                        onClick={() => void handleDeleteGroup(group.id)}
                        title="Delete group"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <PayrollFormSheet onClose={() => setIsModalOpen(false)} open={isModalOpen} title="Create payroll group">
          <form className="pr-form" onSubmit={handleCreateGroup}>
            <label className="pr-field">
              <span>Group name *</span>
              <Input
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Engineering Team"
                required
                value={name}
              />
            </label>

            <label className="pr-field">
              <span>Description</span>
              <Input
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional department notes"
                value={description}
              />
            </label>

            <div className="pr-field">
              <span>Default schedule</span>
              <div className="pr-segment" role="group" aria-label="Default schedule">
                {(
                  [
                    ["MONTHLY", "Monthly"],
                    ["BIWEEKLY", "Biweekly"],
                    ["WEEKLY", "Weekly"],
                  ] as const
                ).map(([value, label]) => (
                  <button aria-pressed={defaultSchedule === value} key={value} onClick={() => setDefaultSchedule(value)} type="button">
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pr-field">
              <span>Members ({selectedMemberIds.length} selected)</span>
              {teamMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active team members yet.</p>
              ) : (
                <ul className="pr-pick">
                  {teamMembers.map((m) => {
                    const checked = selectedMemberIds.includes(m.id);
                    return (
                      <li key={m.id}>
                        <button
                          aria-pressed={checked}
                          onClick={() =>
                            setSelectedMemberIds((prev) =>
                              checked ? prev.filter((i) => i !== m.id) : [...prev, m.id],
                            )
                          }
                          type="button"
                        >
                          <span className="pr-avatar is-sm">
                            <UserRound className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{m.full_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{m.role || m.member_type}</span>
                          </span>
                          <span className={checked ? "pr-check is-on" : "pr-check"}>
                            {checked ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="pr-form-actions">
              <Button className="h-12 w-full rounded-xl font-bold" disabled={submitting} type="submit">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? "Creating…" : "Create group"}
              </Button>
              <Button className="h-11 w-full rounded-xl" onClick={() => setIsModalOpen(false)} type="button" variant="ghost">
                Cancel
              </Button>
            </div>
          </form>
        </PayrollFormSheet>
      </PlatformChrome>
    </PlatformAccessGate>
  );
}

function frequencyLabel(value?: string | null) {
  const text = (value || "MONTHLY").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
