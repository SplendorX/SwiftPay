"use client";

import { AlertCircle, Check, Loader2, UserCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Chain,
} from "viem";

import { Button } from "@/components/ui/button";
import { swiftPayrollExecutorAbi } from "@/lib/contracts";
import { onchainFacts } from "@/lib/onchain-facts";
import { fetchTeamMembers } from "@/lib/payroll/client";
import type { PaymentFrequency, TeamMemberRecord } from "@/lib/payroll/types";
import { useSigningWallet } from "@/lib/use-signing-wallet";

/**
 * Registers the business's team with the payroll executor.
 *
 * The executor pays only wallets registered here, each up to a cap per pay
 * period. So even SwiftPay's own operator key can never send payroll money
 * anywhere else, or more than the cap, without the business signing first.
 */

const DAY = 24 * 60 * 60;

/** Slightly under the pay interval, so a late run or short month still pays. */
function periodFor(frequency: PaymentFrequency) {
  switch (frequency) {
    case "WEEKLY":
      return 6 * DAY;
    case "BIWEEKLY":
      return 13 * DAY;
    default:
      return 27 * DAY;
  }
}

/** Room for bonuses and adjustments above usual pay. */
const CAP_HEADROOM_PERCENT = BigInt(125);

type Payee = {
  cap: bigint;
  member: TeamMemberRecord;
  period: number;
  registeredCap: bigint;
  registeredPeriod: number;
  wallet: Address;
};

export function PayrollTeamRegistration({
  circleSocialUuid,
  executor,
  payer,
  token,
  workspaceId,
}: {
  circleSocialUuid?: string;
  executor: Address;
  payer: Address;
  token: Address;
  workspaceId?: string;
}) {
  const wallet = useSigningWallet();
  const [payees, setPayees] = useState<Payee[] | null>(null);
  const [skipped, setSkipped] = useState<TeamMemberRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const members = await fetchTeamMembers(
        payer,
        { status: "ACTIVE" },
        circleSocialUuid,
        workspaceId,
      );
      const client = createPublicClient({
        chain: onchainFacts.chain as Chain,
        transport: http(onchainFacts.rpcUrl),
      });

      const payable = members.filter((member) => isAddress(member.wallet_address));
      setSkipped(members.filter((member) => !isAddress(member.wallet_address)));

      const rows = await Promise.all(
        payable.map(async (member) => {
          const memberWallet = getAddress(member.wallet_address);
          const [registeredCap, , registeredPeriod] = (await client.readContract({
            abi: swiftPayrollExecutorAbi,
            address: executor,
            args: [payer, token, memberWallet],
            functionName: "payees",
          })) as readonly [bigint, bigint, bigint, bigint];
          const usual = parseUnits(member.default_payment_amount || "0", 6);
          return {
            cap: (usual * CAP_HEADROOM_PERCENT) / BigInt(100),
            member,
            period: periodFor(member.payment_frequency),
            registeredCap,
            registeredPeriod: Number(registeredPeriod),
            wallet: memberWallet,
          };
        }),
      );
      setPayees(rows.filter((row) => row.cap > BigInt(0)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the team.");
      setPayees(null);
    } finally {
      setLoading(false);
    }
  }, [circleSocialUuid, executor, payer, token, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const outdated = useMemo(
    () =>
      (payees ?? []).filter(
        (row) => row.registeredCap !== row.cap || row.registeredPeriod !== row.period,
      ),
    [payees],
  );

  async function register() {
    if (!outdated.length) return;
    if (!wallet.resolveProvider) {
      toast.error(wallet.reason ?? "Connect the business wallet to register the team.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const provider = await wallet.resolveProvider();
      const walletClient = createWalletClient({
        account: payer,
        chain: onchainFacts.chain as Chain,
        transport: custom(provider as { request: (args: unknown) => Promise<unknown> }),
      });
      const client = createPublicClient({
        chain: onchainFacts.chain as Chain,
        transport: http(onchainFacts.rpcUrl),
      });

      // One transaction per pay period; most teams share a single one.
      const byPeriod = new Map<number, Payee[]>();
      for (const row of outdated) {
        byPeriod.set(row.period, [...(byPeriod.get(row.period) ?? []), row]);
      }

      for (const [period, rows] of byPeriod) {
        const hash = await walletClient.sendTransaction({
          data: encodeFunctionData({
            abi: swiftPayrollExecutorAbi,
            args: [
              token,
              rows.map((row) => row.wallet),
              rows.map((row) => row.cap),
              BigInt(period),
            ],
            functionName: "setPayees",
          }),
          to: executor,
        });
        await client.waitForTransactionReceipt({ hash });
      }

      toast.success("Team registered for automatic payroll");
      await load();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message.split("\n")[0] : "Registration failed.";
      if (!/user rejected|denied|4001/i.test(message)) {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  const registeredCount = (payees ?? []).length - outdated.length;

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {payees && outdated.length === 0 && payees.length > 0 ? (
            <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold">Team on-chain</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Automatic payroll can only pay the people you register here, each
              up to 125% of their usual pay per pay period. Nobody else can be
              added to a run — not even by SwiftPay.
            </p>
            {payees ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {registeredCount} of {payees.length} registered
                {outdated.length > 0
                  ? ` · ${outdated.length} new or changed since last time`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>

        {loading && !payees ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : outdated.length > 0 ? (
          <Button
            className="h-9"
            disabled={busy}
            onClick={() => void register()}
            size="sm"
            type="button"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {registeredCount > 0 ? "Update team" : "Register team"}
          </Button>
        ) : null}
      </div>

      {outdated.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {outdated.map((row) => (
            <li className="flex justify-between gap-2 text-xs" key={row.member.id}>
              <span className="truncate">{row.member.full_name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                up to {Number(formatUnits(row.cap, 6)).toLocaleString()} USDC
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {skipped.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {skipped.map((member) => member.full_name).join(", ")}{" "}
          {skipped.length === 1 ? "has" : "have"} no wallet address, so{" "}
          {skipped.length === 1 ? "is" : "are"} paid by hand.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 inline-flex items-start gap-1.5 text-xs font-semibold text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
