"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  Banknote,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Send,
  Trash2,
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
import {
  calculateItemAmounts,
  calculateRunTotals,
} from "@/lib/payroll/calculation-service";
import {
  createPayrollRunClient,
  fetchPayrollGroups,
  fetchTeamMembers,
} from "@/lib/payroll/client";
import type {
  PayrollAdjustmentType,
  PayrollGroupRecord,
  TeamMemberRecord,
} from "@/lib/payroll/types";

type ItemDraft = {
  teamMemberId: string;
  fullName: string;
  role: string | null;
  paymentDestinationType: string;
  swiftpayUsername: string | null;
  walletAddress: string;
  baseAmount: string;
  adjustments: Array<{
    type: PayrollAdjustmentType;
    amount: string;
    reason?: string | null;
  }>;
};

export default function NewPayrollRunPage() {
  const router = useRouter();
  const { ownerWallet, circleSocialUuid } = useAccountContext();
  const [name, setName] = useState(() => {
    const d = new Date();
    return `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()} Payroll`;
  });

  const [groups, setGroups] = useState<PayrollGroupRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [allMembers, setAllMembers] = useState<TeamMemberRecord[]>([]);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load groups and active team members
  useEffect(() => {
    if (!ownerWallet) return;
    setLoading(true);
    Promise.all([
      fetchPayrollGroups(ownerWallet, circleSocialUuid ?? undefined),
      fetchTeamMembers(ownerWallet, { status: "ACTIVE" }, circleSocialUuid ?? undefined),
    ])
      .then(([groupsData, membersData]) => {
        setGroups(groupsData);
        setAllMembers(membersData);
        initItems(membersData);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load team data.");
      })
      .finally(() => setLoading(false));
  }, [ownerWallet, circleSocialUuid]);

  function initItems(membersList: TeamMemberRecord[], groupId?: string) {
    let filtered = membersList;
    if (groupId) {
      const g = groups.find((grp) => grp.id === groupId);
      if (g?.member_ids) {
        const idSet = new Set(g.member_ids);
        filtered = membersList.filter((m) => idSet.has(m.id));
      }
    }

    setItems(
      filtered.map((m) => ({
        teamMemberId: m.id,
        fullName: m.full_name,
        role: m.role,
        paymentDestinationType: m.payment_destination_type,
        swiftpayUsername: m.swiftpay_username,
        walletAddress: m.wallet_address,
        baseAmount: m.default_payment_amount || "0",
        adjustments: [],
      })),
    );
  }

  function handleGroupChange(newGroupId: string) {
    setSelectedGroupId(newGroupId);
    initItems(allMembers, newGroupId || undefined);
  }

  function updateBaseAmount(index: number, amount: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], baseAmount: amount };
      return next;
    });
  }

  function addAdjustment(index: number, type: PayrollAdjustmentType) {
    setItems((prev) => {
      const next = [...prev];
      const item = next[index];
      next[index] = {
        ...item,
        adjustments: [
          ...item.adjustments,
          { type, amount: "100", reason: type === "BONUS" ? "Performance bonus" : "Adjustment" },
        ],
      };
      return next;
    });
  }

  function updateAdjustment(itemIndex: number, adjIndex: number, patch: { amount?: string; reason?: string }) {
    setItems((prev) => {
      const next = [...prev];
      const item = next[itemIndex];
      const newAdjs = [...item.adjustments];
      newAdjs[adjIndex] = { ...newAdjs[adjIndex], ...patch };
      next[itemIndex] = { ...item, adjustments: newAdjs };
      return next;
    });
  }

  function removeAdjustment(itemIndex: number, adjIndex: number) {
    setItems((prev) => {
      const next = [...prev];
      const item = next[itemIndex];
      next[itemIndex] = {
        ...item,
        adjustments: item.adjustments.filter((_, i) => i !== adjIndex),
      };
      return next;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // Real-time server-matching calculations
  const totals = useMemo(() => {
    const calculatedItems = items.map((it) =>
      calculateItemAmounts(it.baseAmount, it.adjustments, "USDC"),
    );
    const runTotals = calculateRunTotals(
      calculatedItems.map((ci) => ({ totalAmount: ci.totalAmount })),
      "USDC",
    );
    return {
      calculatedItems,
      ...runTotals,
    };
  }, [items]);

  async function handleSubmit() {
    if (!ownerWallet || items.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const run = await createPayrollRunClient(
        ownerWallet,
        {
          name: name.trim() || "Payroll Run",
          source: "MANUAL",
          asset: "USDC",
          payrollGroupId: selectedGroupId || null,
          items: items.map((it) => ({
            teamMemberId: it.teamMemberId,
            recipientName: it.fullName,
            recipientDestination: it.walletAddress,
            recipientUsername: it.swiftpayUsername,
            baseAmount: it.baseAmount,
            adjustments: it.adjustments,
          })),
        },
        circleSocialUuid ?? undefined,
      );
      router.push(`/business/payroll/runs/${run.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create payroll run.");
      setSubmitting(false);
    }
  }

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Configure recipient payments and adjustments for review."
        title="Create Payroll Run"
      >
        <div className="mb-4">
          <Button asChild size="sm" variant="ghost">
            <Link href="/business/payroll">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Payroll
            </Link>
          </Button>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          {/* Main Form */}
          <div className="space-y-6">
            <div className="section-panel p-5">
              <h3 className="font-heading font-bold text-lg mb-4">Run Details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Payroll Run Name *</label>
                  <Input
                    className="mt-1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. September 2026 Payroll"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Target Group</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    value={selectedGroupId}
                    onChange={(e) => handleGroupChange(e.target.value)}
                  >
                    <option value="">All Active Team Members ({allMembers.length})</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.members_count ?? 0} members)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Recipient Item Configurations */}
            <div className="section-panel p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold text-lg">
                  Recipients ({items.length})
                </h3>
                <span className="text-xs text-muted-foreground">USDC (Arc Testnet)</span>
              </div>

              {loading ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading eligible team members…
                </div>
              ) : items.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No active team members available for this selection.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((item, index) => {
                    const ci = totals.calculatedItems[index];

                    return (
                      <div key={item.teamMemberId} className="py-4 first:pt-0 last:pb-0 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground truncate">
                                {item.fullName}
                              </span>
                              {item.role ? (
                                <span className="text-xs text-muted-foreground">({item.role})</span>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {item.paymentDestinationType === "SWIFTPAY_USER" ? `@${item.swiftpayUsername}` : item.walletAddress}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-32">
                              <label className="text-[10px] text-muted-foreground uppercase font-bold block">
                                Base (USDC)
                              </label>
                              <Input
                                type="number"
                                step="any"
                                className="h-8 text-xs font-semibold text-right"
                                value={item.baseAmount}
                                onChange={(e) => updateBaseAmount(index, e.target.value)}
                              />
                            </div>

                            <button
                              onClick={() => removeItem(index)}
                              className="text-muted-foreground hover:text-destructive p-1 rounded mt-4"
                              title="Remove recipient from this run"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Adjustments Section (Section 28) */}
                        {item.adjustments.length > 0 ? (
                          <div className="pl-4 space-y-2 border-l-2 border-primary/20">
                            {item.adjustments.map((adj, adjIdx) => (
                              <div key={adjIdx} className="flex items-center gap-2 text-xs">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold text-[10px] uppercase ${
                                    adj.type === "BONUS"
                                      ? "bg-emerald-500/10 text-emerald-600"
                                      : adj.type === "DEDUCTION"
                                      ? "bg-rose-500/10 text-rose-600"
                                      : "bg-blue-500/10 text-blue-600"
                                  }`}
                                >
                                  {adj.type}
                                </span>
                                <Input
                                  className="h-7 w-24 text-xs font-semibold text-right"
                                  type="number"
                                  step="any"
                                  value={adj.amount}
                                  onChange={(e) => updateAdjustment(index, adjIdx, { amount: e.target.value })}
                                />
                                <Input
                                  className="h-7 flex-1 text-xs"
                                  placeholder="Reason (e.g. Q3 performance)"
                                  value={adj.reason || ""}
                                  onChange={(e) => updateAdjustment(index, adjIdx, { reason: e.target.value })}
                                />
                                <button
                                  onClick={() => removeAdjustment(index, adjIdx)}
                                  className="text-muted-foreground hover:text-destructive p-1"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {/* Total per Item + Quick Add Adjustment buttons */}
                        <div className="flex items-center justify-between text-xs pt-1">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => addAdjustment(index, "BONUS")}
                              className="text-[11px] font-semibold text-primary hover:underline flex items-center"
                            >
                              <Plus className="h-3 w-3 mr-0.5" /> Bonus
                            </button>
                            <span className="text-muted-foreground">·</span>
                            <button
                              type="button"
                              onClick={() => addAdjustment(index, "DEDUCTION")}
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center"
                            >
                              <Plus className="h-3 w-3 mr-0.5" /> Deduction
                            </button>
                          </div>

                          <div className="font-semibold text-foreground">
                            Payout: <span className="font-bold text-sm">{ci ? ci.totalAmount : item.baseAmount} USDC</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Summary Panel */}
          <div className="space-y-4">
            <div className="section-panel p-5 sticky top-6">
              <h3 className="font-heading font-bold text-lg mb-4">Run Summary</h3>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Recipients</span>
                  <span className="font-semibold text-foreground">{totals.recipientCount}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Total Payout</span>
                  <span className="font-heading font-bold text-foreground">{totals.totalAmount} USDC</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Platform Fee (1%)</span>
                  <span className="font-semibold text-muted-foreground">{totals.totalFees} USDC</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-bold text-foreground">Total Required</span>
                  <span className="font-heading text-lg font-bold text-primary">
                    {totals.totalRequired} USDC
                  </span>
                </div>
              </div>

              <Button
                className="w-full mt-6"
                disabled={items.length === 0 || submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating Run…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Proceed to Review
                  </>
                )}
              </Button>
              <p className="mt-2 text-[11px] text-center text-muted-foreground">
                You will have a full review screen to inspect and explicitly approve before funds are settled.
              </p>
            </div>
          </div>
        </div>
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
