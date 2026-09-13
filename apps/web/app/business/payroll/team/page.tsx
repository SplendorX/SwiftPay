"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  AtSign,
  Briefcase,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  UserCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import { useAccountContext } from "@/components/account/account-provider";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddTeamMemberModal } from "@/components/payroll/add-team-member-modal";
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge";
import { PayrollSubnav } from "@/components/payroll/payroll-subnav";
import {
  archiveTeamMemberClient,
  fetchTeamMembers,
  pauseTeamMemberClient,
  reactivateTeamMemberClient,
} from "@/lib/payroll/client";
import type { TeamMemberRecord, TeamMemberStatus } from "@/lib/payroll/types";

export default function TeamManagementPage() {
  const { ownerWallet, circleSocialUuid } = useAccountContext();
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMembers() {
    if (!ownerWallet) return;
    setLoading(true);
    try {
      const data = await fetchTeamMembers(
        ownerWallet,
        { includeArchived: true },
        circleSocialUuid ?? undefined,
      );
      setMembers(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load team members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [ownerWallet, circleSocialUuid]);

  async function handleTogglePause(member: TeamMemberRecord) {
    if (!ownerWallet) return;
    setActionLoading(member.id);
    try {
      if (member.status === "ACTIVE") {
        await pauseTeamMemberClient(ownerWallet, member.id, circleSocialUuid ?? undefined);
      } else if (member.status === "PAUSED") {
        await reactivateTeamMemberClient(ownerWallet, member.id, circleSocialUuid ?? undefined);
      }
      await loadMembers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to toggle status.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleArchive(member: TeamMemberRecord) {
    if (!ownerWallet) return;
    if (!confirm(`Are you sure you want to archive ${member.full_name}? They will be excluded from future payroll runs, but history is retained.`)) {
      return;
    }
    setActionLoading(member.id);
    try {
      await archiveTeamMemberClient(ownerWallet, member.id, circleSocialUuid ?? undefined);
      await loadMembers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to archive member.");
    } finally {
      setActionLoading(null);
    }
  }

  const filteredMembers = members.filter((m) => {
    if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
    if (typeFilter !== "ALL" && m.member_type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = m.full_name.toLowerCase().includes(q);
      const matchRole = m.role?.toLowerCase().includes(q);
      const matchUser = m.swiftpay_username?.toLowerCase().includes(q);
      const matchAddr = m.wallet_address.toLowerCase().includes(q);
      if (!matchName && !matchRole && !matchUser && !matchAddr) return false;
    }
    return true;
  });

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Team Member
            </Button>
            <PlatformProfileControls />
          </div>
        }
        subtitle="Manage employees, contractors, and payment setups."
        title="Team Members"
      >
        <PayrollSubnav />

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Filter and Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="relative flex-1 min-w-[16rem]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, role, handle, or wallet…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="ARCHIVED">Archived</option>
            </select>

            <select
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All Types</option>
              <option value="EMPLOYEE">Employees</option>
              <option value="CONTRACTOR">Contractors</option>
            </select>
          </div>
        </div>

        {/* Team List Table */}
        <div className="section-panel overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading team members…
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-12 text-center p-6">
              <Users className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-sm font-semibold">
                {search || statusFilter !== "ALL" || typeFilter !== "ALL"
                  ? "No matching team members found"
                  : "Build your payroll team"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                {search || statusFilter !== "ALL" || typeFilter !== "ALL"
                  ? "Try adjusting your search query or filters."
                  : "Add employees or contractors to start managing payments."}
              </p>
              <Button size="sm" className="mt-4" onClick={() => setIsAddModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Team Member
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/business/payroll/team/${member.id}`}
                          className="font-semibold text-foreground hover:underline truncate"
                        >
                          {member.full_name}
                        </Link>
                        <PayrollStatusBadge status={member.status} />
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
                          {member.member_type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.role || "No role"} ·{" "}
                        {member.payment_destination_type === "SWIFTPAY_USER" ? (
                          <span className="inline-flex items-center">
                            <AtSign className="h-3 w-3 mr-0.5 inline text-primary" />
                            {member.swiftpay_username}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px]">
                            {member.wallet_address.slice(0, 6)}…{member.wallet_address.slice(-4)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-semibold text-foreground">
                        {member.default_payment_amount} {member.preferred_asset}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {member.payment_frequency.toLowerCase()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {member.status !== "ARCHIVED" ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleTogglePause(member)}
                            disabled={actionLoading === member.id}
                            title={member.status === "ACTIVE" ? "Pause member" : "Reactivate member"}
                          >
                            {member.status === "ACTIVE" ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleArchive(member)}
                            disabled={actionLoading === member.id}
                            title="Archive member"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}

                      <Button asChild size="sm" variant="outline">
                        <Link href={`/business/payroll/team/${member.id}`}>
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {ownerWallet ? (
          <AddTeamMemberModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            ownerWallet={ownerWallet}
            circleSocialUuid={circleSocialUuid ?? undefined}
            onCreated={() => void loadMembers()}
          />
        ) : null}
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
