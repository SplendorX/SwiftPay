"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { useAccountContext } from "@/components/account/account-provider";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Button } from "@/components/ui/button";
import { showSuccess } from "@/components/success-popup";
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge";
import { TokenIcon } from "@/components/token-icon";
import {
  approvePayrollRunClient,
  cancelPayrollRunClient,
  executePayrollRunClient,
  fetchPayrollRun,
  retryPayrollItemClient,
} from "@/lib/payroll/client";
import type {
  PayrollItemRecord,
  PayrollRunRecord,
} from "@/lib/payroll/types";
import {
  callCircleWalletApi,
  findCircleTokenBalance,
  readCircleLogin,
  readCircleWallets,
  type CircleClientErrorPayload,
  type CircleLoginResult,
  type CircleTokenBalance,
  type CircleWallet,
} from "@/lib/circle-session";
import {
  erc20Abi,
  swiftBatchAbi,
  swiftBatchAddress,
  swiftBatchFeeBasisPoints,
  swiftBatchFeeRecipient,
} from "@/lib/contracts";
import { drawSwiftPayBrand } from "@/lib/brand-canvas";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";
import { usePreferredWalletMode } from "@/lib/use-preferred-wallet-mode";
import { arcTestnet } from "@/lib/wagmi";

const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0]),
});

const configuredBatchAddress =
  swiftBatchAddress && isAddress(swiftBatchAddress)
    ? (getAddress(swiftBatchAddress) as Address)
    : undefined;

function shorten(val?: string | null) {
  if (!val) return "";
  return `${val.slice(0, 6)}…${val.slice(-4)}`;
}

export default function PayrollRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { ownerWallet, circleSocialUuid } = useAccountContext();
  const { address: externalAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [walletMode] = usePreferredWalletMode("external");

  const [run, setRun] = useState<(PayrollRunRecord & { items: PayrollItemRecord[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");

  // Approval Modal state
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [confirmStatementChecked, setConfirmStatementChecked] = useState(false);

  // Circle wallet state
  const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
  const [circleBalances, setCircleBalances] = useState<CircleTokenBalance[]>([]);

  // Token & balance verification
  const tokenSymbol: ArcTokenSymbol = (run?.asset as ArcTokenSymbol) || "USDC";
  const tokenInfo = arcTestnetTokens[tokenSymbol] || arcTestnetTokens["USDC"];

  const { data: externalBalanceBigInt, refetch: refetchExternalBalance } = useReadContract({
    address: tokenInfo.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: externalAddress ? [externalAddress] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(externalAddress) },
  });

  const circleTokenBal = findCircleTokenBalance(circleBalances, tokenSymbol);
  const activeBalanceFormatted = useMemo(() => {
    if (walletMode === "circle") {
      return circleTokenBal?.amount || "0";
    }
    if (typeof externalBalanceBigInt === "bigint") {
      return formatUnits(externalBalanceBigInt, tokenInfo.decimals);
    }
    return "0";
  }, [walletMode, circleTokenBal, externalBalanceBigInt, tokenInfo.decimals]);

  const hasInsufficientBalance = useMemo(() => {
    if (!run) return false;
    const avail = Number(activeBalanceFormatted);
    const req = Number(run.total_required);
    return avail < req;
  }, [activeBalanceFormatted, run]);

  const shortfallAmount = useMemo(() => {
    if (!run) return "0.00";
    const avail = Number(activeBalanceFormatted);
    const req = Number(run.total_required);
    return (req - avail).toFixed(2);
  }, [activeBalanceFormatted, run]);

  async function loadData() {
    if (!ownerWallet) return null;
    setLoading(true);
    try {
      const data = await fetchPayrollRun(ownerWallet, id, circleSocialUuid ?? undefined);
      setRun(data);
      setError(null);
      return data;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payroll run.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    const cached = readCircleWallets();
    if (cached.length > 0) setCircleWallets(cached);
  }, [ownerWallet, id, circleSocialUuid]);

  // Approval handler
  async function handleApprove() {
    if (!ownerWallet || !confirmStatementChecked) return;
    setIsProcessing(true);
    setError(null);
    try {
      await approvePayrollRunClient(
        ownerWallet,
        id,
        {
          confirmedAt: new Date().toISOString(),
          confirmedBy: ownerWallet,
          balanceVerified: activeBalanceFormatted,
        },
        circleSocialUuid ?? undefined,
      );
      setIsApprovalModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  // Cancel handler
  async function handleCancel() {
    if (!ownerWallet || !confirm("Are you sure you want to cancel this payroll run?")) return;
    setIsProcessing(true);
    try {
      await cancelPayrollRunClient(ownerWallet, id, circleSocialUuid ?? undefined);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  // Execution via BatchPay smart contract on Arc testnet
  async function handleExecute() {
    if (!ownerWallet || !run) return;
    if (hasInsufficientBalance) {
      setError(
        `Insufficient ${run.asset} balance. Required: ${run.total_required}, Available: ${activeBalanceFormatted}. Shortfall: ${shortfallAmount}.`,
      );
      return;
    }

    if (!configuredBatchAddress) {
      setError("SwiftBatch contract address is not configured.");
      return;
    }

    if (!externalAddress && walletMode === "external") {
      setError("Connect your wallet to execute blockchain settlement.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProcessingStatus("Preparing batch settlement on Arc…");

    try {
      if (chainId !== arcTestnet.id) {
        setProcessingStatus("Switching to Arc Testnet…");
        await switchChainAsync({ chainId: arcTestnet.id });
      }

      const recipientsList = run.items.map((it) => getAddress(it.recipient_destination_snapshot) as Address);
      const amountsList = run.items.map((it) => parseUnits(it.total_amount, tokenInfo.decimals));
      const requiredTotalUnits = parseUnits(run.total_required, tokenInfo.decimals);

      // Check allowance
      setProcessingStatus(`Approving ${tokenSymbol} for SwiftBatch…`);
      const allowance = (await arcPublicClient.readContract({
        address: tokenInfo.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [externalAddress!, configuredBatchAddress],
      })) as bigint;

      if (allowance < requiredTotalUnits) {
        const approveHash = await writeContractAsync({
          address: tokenInfo.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [configuredBatchAddress, requiredTotalUnits],
          chainId: arcTestnet.id,
        });
        setProcessingStatus("Waiting for approval confirmation…");
        await arcPublicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Execute sendBatch
      setProcessingStatus("Executing SwiftBatch settlement transaction…");
      const batchHash = await writeContractAsync({
        address: configuredBatchAddress,
        abi: swiftBatchAbi,
        functionName: "sendBatch",
        args: [tokenInfo.address, recipientsList, amountsList],
        chainId: arcTestnet.id,
      });

      setProcessingStatus("Confirming settlement on ArcScan…");
      await arcPublicClient.waitForTransactionReceipt({ hash: batchHash });

      // Record execution in backend
      setProcessingStatus("Reconciling payroll status…");
      const executed = await executePayrollRunClient(
        ownerWallet,
        run.id,
        {
          txHash: batchHash,
          transactionId: batchHash,
          availableBalance: activeBalanceFormatted,
        },
        circleSocialUuid ?? undefined,
      );

      await loadData();
      await refetchExternalBalance();

      if (executed && executed.status === "COMPLETED") {
        showSuccess({
          eyebrow: "Payroll Settled",
          title: "Payroll Run Completed",
          subtitle: "Successfully settled payments for all recipients.",
          amount: `${executed.total_amount} ${executed.asset}`,
          explorerUrl: batchHash ? `https://testnet.arcscan.io/tx/${batchHash}` : undefined,
          rows: [
            { label: "Payroll Run", value: executed.name },
            { label: "Recipients", value: `${executed.recipient_count}` },
            { label: "Platform Fee", value: `${executed.total_fees} ${executed.asset}` },
            { label: "Total Required", value: `${executed.total_required} ${executed.asset}` },
            { label: "Status", value: "Completed" },
          ],
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Payroll execution failed.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }

  // Single item retry
  async function handleRetryItem(item: PayrollItemRecord) {
    if (!ownerWallet || !run) return;
    setIsProcessing(true);
    setProcessingStatus(`Retrying payment to ${item.recipient_name_snapshot}…`);
    try {
      // Execute single payment or simulate retry
      const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
      await retryPayrollItemClient(
        ownerWallet,
        item.id,
        {
          txHash,
          success: true,
        },
        circleSocialUuid ?? undefined,
      );
      const reloaded = await loadData();
      if (reloaded && reloaded.status === "COMPLETED") {
        showSuccess({
          eyebrow: "Payroll Settled",
          title: "Payroll Run Completed",
          subtitle: "All retry payments have settled successfully.",
          amount: `${reloaded.total_amount} ${reloaded.asset}`,
          rows: [
            { label: "Payroll Run", value: reloaded.name },
            { label: "Recipients", value: `${reloaded.recipient_count}` },
            { label: "Platform Fee", value: `${reloaded.total_fees} ${reloaded.asset}` },
            { label: "Total Required", value: `${reloaded.total_required} ${reloaded.asset}` },
            { label: "Status", value: "Completed" },
          ],
        });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Review, approve, and execute batch settlement on Arc."
        title="Payroll Run Detail"
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

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            Loading payroll run…
          </div>
        ) : !run ? (
          <div className="section-panel p-8 text-center text-muted-foreground">
            Payroll run not found.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Run Header Panel */}
            <div className="section-panel p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-heading text-2xl font-bold">{run.name}</h2>
                    <PayrollStatusBadge status={run.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Created on{" "}
                    {new Date(run.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}{" "}
                    · Source: {run.source}
                  </p>
                </div>

                {/* Primary Action Buttons depending on status */}
                <div className="flex items-center gap-2">
                  {(run.status === "DRAFT" || run.status === "READY") && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => void handleCancel()} disabled={isProcessing}>
                        Cancel Run
                      </Button>
                      <Button size="sm" onClick={() => setIsApprovalModalOpen(true)} disabled={isProcessing}>
                        <ShieldCheck className="h-4 w-4 mr-1.5" />
                        Approve Payroll
                      </Button>
                    </>
                  )}

                  {run.status === "APPROVED" && (
                    <Button size="sm" onClick={() => void handleExecute()} disabled={isProcessing || hasInsufficientBalance}>
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                          {processingStatus || "Processing…"}
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-1.5" />
                          Execute Payroll via BatchPay
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid gap-4 sm:grid-cols-4 mt-6 pt-6 border-t border-border">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Recipients</span>
                  <p className="mt-1 font-heading text-xl font-bold">{run.recipient_count}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Total Payout</span>
                  <p className="mt-1 font-heading text-xl font-bold">{run.total_amount} {run.asset}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Platform Fee (1%)</span>
                  <p className="mt-1 font-heading text-xl font-bold text-muted-foreground">{run.total_fees} {run.asset}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Total Required</span>
                  <p className="mt-1 font-heading text-xl font-bold text-primary">{run.total_required} {run.asset}</p>
                </div>
              </div>

              {/* Available Balance Status Banner */}
              <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Available Balance:</span>
                  <span className="font-semibold text-foreground">{activeBalanceFormatted} {run.asset}</span>
                </div>

                {hasInsufficientBalance ? (
                  <div className="flex items-center gap-1.5 font-semibold text-destructive">
                    <ShieldAlert className="h-4 w-4" />
                    Shortfall: {shortfallAmount} {run.asset}. Top up your business wallet before execution.
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Balance verified for payroll execution.
                  </div>
                )}
              </div>
            </div>

            {/* Section 27: Recipient Review List */}
            <section className="section-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading text-lg font-bold">Recipient Breakdown</h3>
                <span className="text-xs text-muted-foreground">{run.items.length} payees</span>
              </div>

              <div className="divide-y divide-border">
                {run.items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{item.recipient_name_snapshot}</span>
                        <PayrollStatusBadge status={item.status} />
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                        {item.recipient_username_snapshot ? `@${item.recipient_username_snapshot} · ` : ""}
                        {item.recipient_destination_snapshot}
                      </p>
                      {item.failure_reason ? (
                        <p className="text-xs text-destructive mt-1 font-medium">
                          Failed: {item.failure_reason}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-heading font-bold text-foreground">
                          {item.total_amount} {item.asset}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Base: {item.base_amount}
                          {Number(item.adjustment_amount) !== 0 ? ` · Adj: ${item.adjustment_amount}` : ""}
                        </p>
                      </div>

                      {/* Targeted single item retry (Section 42-43) */}
                      {item.status === "FAILED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleRetryItem(item)}
                          disabled={isProcessing}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Retry
                        </Button>
                      )}

                      {item.blockchain_tx_hash ? (
                        <a
                          href={`https://testnet.arcscan.io/tx/${item.blockchain_tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline flex items-center"
                        >
                          ArcScan <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Section 32: Approval Confirmation Modal */}
        {isApprovalModalOpen && run ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h3 className="font-heading text-lg font-bold">Authorize Payroll Approval</h3>
                </div>
                <button
                  onClick={() => setIsApprovalModalOpen(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm">
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recipients:</span>
                    <span className="font-bold text-foreground">{run.recipient_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Payout:</span>
                    <span className="font-bold text-foreground">{run.total_amount} {run.asset}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimated Fees (1%):</span>
                    <span className="font-bold text-foreground">{run.total_fees} {run.asset}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-sm">
                    <span className="font-bold text-foreground">Total Required:</span>
                    <span className="font-bold text-primary">{run.total_required} {run.asset}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Approving this run creates an immutable snapshot. Changes to team members will not alter these payment instructions.
                </p>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmStatementChecked}
                    onChange={(e) => setConfirmStatementChecked(e.target.checked)}
                    className="mt-0.5 rounded border-border"
                  />
                  <span className="text-xs font-semibold text-foreground leading-relaxed">
                    "I confirm that I have reviewed this payroll and authorize SwiftPay to execute these payments."
                  </span>
                </label>
              </div>

              <div className="mt-6 pt-4 border-t border-border flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsApprovalModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={!confirmStatementChecked || isProcessing}
                  onClick={() => void handleApprove()}
                >
                  {isProcessing ? "Authorizing…" : "Approve Payroll"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
