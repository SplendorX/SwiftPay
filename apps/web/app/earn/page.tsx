"use client";

import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Info,
  Loader2,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseUnits, type Hash } from "viem";

import { AutoSavePanel } from "@/components/earn/auto-save-panel";
import { EarnModeBanner } from "@/components/earn/earn-mode-banner";
import { EarnTransactions } from "@/components/earn/earn-transactions";
import { PerformanceCard } from "@/components/earn/performance-card";
import { YieldChart } from "@/components/earn/yield-chart";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { erc20Abi } from "@/lib/contracts";
import {
  earnConfig,
  explorerAddressUrl,
  explorerTxUrl,
  isEarnDepositEnabled,
} from "@/lib/earn/config";
import { swiftPayVaultAbi, yieldStrategyAbi } from "@/lib/earn/abis";
import { formatUnitsToDecimal } from "@/lib/earn/decimal";
import {
  buildPortfolioSeries,
  computeEarnPerformance,
  formatUsdDisplay,
  type EarnHistoryEvent,
  type EarnPerformanceSummary,
  type PortfolioChartPoint,
} from "@/lib/earn/performance";
import { arcTestnetTokens } from "@/lib/tokens";
import { trackTractionEvent } from "@/lib/traction/client";
import { cn } from "@/lib/utils";
import { arcTestnet } from "@/lib/wagmi";

const usdc = arcTestnetTokens.USDC;
const zero = BigInt(0);

function formatUsd(amount: bigint | undefined, decimals = 6) {
  if (amount === undefined) return "—";
  return formatUsdDisplay(formatUnitsToDecimal(amount, decimals));
}

function shorten(address?: string | null) {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function EarnPageInner() {
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const vault = earnConfig.vaultAddress;
  const strategy = earnConfig.strategyAddress;
  const mode = earnConfig.mode;
  const depositsEnabled = isEarnDepositEnabled(mode) && Boolean(vault);

  const initialPanel = searchParams.get("action");
  const [depositInput, setDepositInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");
  const [activePanel, setActivePanel] = useState<"deposit" | "withdraw" | null>(
    initialPanel === "deposit" || initialPanel === "withdraw"
      ? initialPanel
      : null,
  );
  const [txHash, setTxHash] = useState<Hash | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [apyDisplay, setApyDisplay] = useState<string>("—");
  const [underlyingApyDisplay, setUnderlyingApyDisplay] = useState<string>("—");
  const [apyMessage, setApyMessage] = useState<string>("");
  const [txRefreshKey, setTxRefreshKey] = useState(0);
  const [historyEvents, setHistoryEvents] = useState<EarnHistoryEvent[]>([]);
  const [buildingHistory, setBuildingHistory] = useState(true);
  const [historyMessage, setHistoryMessage] = useState<string | undefined>();
  const [sessionTxs, setSessionTxs] = useState<
    Array<{
      hash: Hash;
      type: "deposit" | "withdraw";
      assetsLabel: string;
      status: "pending" | "confirmed";
    }>
  >([]);
  const [pendingTxType, setPendingTxType] = useState<
    "deposit" | "withdraw" | null
  >(null);
  const [pendingTxAmountLabel, setPendingTxAmountLabel] = useState("");
  const [pendingTxAmount, setPendingTxAmount] = useState("");
  const [rangeTab, setRangeTab] = useState<"24H" | "7D" | "30D" | "ALL">("ALL");
  const trackedConfirmedEarnTxs = useRef(new Set<string>());

  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const loadApy = useCallback(async () => {
    try {
      const apyRes = await fetch("/api/earn/apy", { cache: "no-store" });
      const apyJson = await apyRes.json();
      if (apyRes.ok) {
        setApyDisplay(
          apyJson.current?.netApyDisplay ??
            apyJson.current?.grossApyDisplay ??
            (mode === "simulation" ? "N/A (sim)" : "N/A"),
        );
        setUnderlyingApyDisplay(
          apyJson.current?.underlyingApyDisplay ??
            apyJson.current?.grossApyDisplay ??
            (mode === "simulation" ? "N/A (sim)" : "N/A"),
        );
        setApyMessage(apyJson.current?.message ?? apyJson.disclaimer ?? "");
      }
    } catch {
      setApyDisplay(mode === "simulation" ? "N/A (sim)" : "N/A");
      setUnderlyingApyDisplay(mode === "simulation" ? "N/A (sim)" : "N/A");
    }
  }, [mode]);

  const loadHistory = useCallback(async () => {
    if (!address) {
      setHistoryEvents([]);
      setBuildingHistory(true);
      return;
    }
    try {
      const res = await fetch(
        `/api/earn/history?ownerWallet=${encodeURIComponent(address)}&limit=100`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) {
        setHistoryEvents([]);
        setBuildingHistory(true);
        setHistoryMessage(
          json.message ?? "Building your earnings history…",
        );
        return;
      }
      const events = (json.events ?? []) as EarnHistoryEvent[];
      setHistoryEvents(events);
      setBuildingHistory(Boolean(json.buildingHistory) || events.length === 0);
      setHistoryMessage(json.message);
    } catch {
      setHistoryEvents([]);
      setBuildingHistory(true);
      setHistoryMessage("Building your earnings history…");
    }
  }, [address]);

  useEffect(() => {
    void loadApy();
  }, [loadApy, isConfirmed]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, isConfirmed, txRefreshKey]);

  useEffect(() => {
    if (initialPanel === "deposit" || initialPanel === "withdraw") {
      setActivePanel(initialPanel);
    }
  }, [initialPanel]);

  useEffect(() => {
    if (!txHash || !pendingTxType) return;
    setSessionTxs((prev) => {
      if (prev.some((t) => t.hash === txHash)) {
        return prev.map((t) =>
          t.hash === txHash
            ? {
                ...t,
                status: isConfirmed ? "confirmed" : "pending",
              }
            : t,
        );
      }
      return [
        {
          hash: txHash,
          type: pendingTxType,
          assetsLabel: pendingTxAmountLabel || "—",
          status: isConfirmed ? "confirmed" : "pending",
        },
        ...prev,
      ];
    });
    if (isConfirmed) {
      if (!trackedConfirmedEarnTxs.current.has(txHash)) {
        trackedConfirmedEarnTxs.current.add(txHash);
        trackTractionEvent({
          amount: pendingTxAmount,
          chainId: arcTestnet.id,
          currency: "USDC",
          eventType:
            pendingTxType === "deposit"
              ? "earn_deposit_completed"
              : "earn_withdraw_completed",
          metadata: {
            mode,
            vault,
          },
          source: "earn",
          txHash,
          walletAddress: address,
        });
      }
      setTxRefreshKey((k) => k + 1);
    }
  }, [
    txHash,
    isConfirmed,
    pendingTxType,
    pendingTxAmountLabel,
    pendingTxAmount,
    mode,
    vault,
    address,
  ]);

  const { data: walletUsdc } = useReadContract({
    address: usdc.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: allowance } = useReadContract({
    address: usdc.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && vault ? [address, vault] : undefined,
    query: { enabled: Boolean(address && vault) },
  });

  const { data: shareBalance, refetch: refetchShares } = useReadContract({
    address: vault ?? undefined,
    abi: swiftPayVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && vault) },
  });

  const { data: earnAssets, refetch: refetchAssets } = useReadContract({
    address: vault ?? undefined,
    abi: swiftPayVaultAbi,
    functionName: "convertToAssets",
    args: shareBalance !== undefined ? [shareBalance as bigint] : undefined,
    query: { enabled: Boolean(vault && shareBalance !== undefined) },
  });

  const { data: totalAssets } = useReadContract({
    address: vault ?? undefined,
    abi: swiftPayVaultAbi,
    functionName: "totalAssets",
    query: { enabled: Boolean(vault) },
  });

  const { data: feeBps } = useReadContract({
    address: vault ?? undefined,
    abi: swiftPayVaultAbi,
    functionName: "performanceFeeBps",
    query: { enabled: Boolean(vault) },
  });

  const { data: strategyName } = useReadContract({
    address: strategy ?? undefined,
    abi: yieldStrategyAbi,
    functionName: "strategyName",
    query: { enabled: Boolean(strategy) },
  });

  const { data: strategyHealthy } = useReadContract({
    address: strategy ?? undefined,
    abi: yieldStrategyAbi,
    functionName: "isHealthy",
    query: { enabled: Boolean(strategy) },
  });

  const { data: isSimulationFlag } = useReadContract({
    address: strategy ?? undefined,
    abi: yieldStrategyAbi,
    functionName: "isSimulation",
    query: { enabled: Boolean(strategy) },
  });

  const { data: maxWithdraw } = useReadContract({
    address: vault ?? undefined,
    abi: swiftPayVaultAbi,
    functionName: "maxWithdraw",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(vault && address) },
  });

  const depositAmountUnits = useMemo(() => {
    try {
      if (!depositInput.trim()) return null;
      return parseUnits(depositInput, usdc.decimals);
    } catch {
      return null;
    }
  }, [depositInput]);

  const withdrawAmountUnits = useMemo(() => {
    try {
      if (!withdrawInput.trim()) return null;
      return parseUnits(withdrawInput, usdc.decimals);
    } catch {
      return null;
    }
  }, [withdrawInput]);

  const { data: previewShares } = useReadContract({
    address: vault ?? undefined,
    abi: swiftPayVaultAbi,
    functionName: "previewDeposit",
    args:
      depositAmountUnits !== null && depositAmountUnits > zero
        ? [depositAmountUnits]
        : undefined,
    query: {
      enabled: Boolean(
        vault && depositAmountUnits !== null && depositAmountUnits > zero,
      ),
    },
  });

  const feeBpsNumber = Number(feeBps ?? earnConfig.performanceFeeBps);
  const feePercent = feeBpsNumber / 100;
  const busy = isWriting || isConfirming;

  const performance: EarnPerformanceSummary | null = useMemo(() => {
    const current =
      typeof earnAssets === "bigint" ? (earnAssets as bigint) : 0n;
    return computeEarnPerformance({
      events: historyEvents,
      currentValueUnits: current,
      decimals: usdc.decimals,
      performanceFeeBps: feeBpsNumber,
    });
  }, [historyEvents, earnAssets, feeBpsNumber]);

  const chartPoints: PortfolioChartPoint[] = useMemo(() => {
    const current =
      typeof earnAssets === "bigint" ? (earnAssets as bigint) : undefined;
    return buildPortfolioSeries({
      events: historyEvents,
      currentValueUnits: current,
      decimals: usdc.decimals,
    });
  }, [historyEvents, earnAssets]);

  const earnedLabel = useMemo(() => {
    if (!performance?.hasHistory) return null;
    const e = performance.totalEarned;
    if (e === "0") return "+$0.00 earned";
    const positive = !e.startsWith("-");
    return `${positive ? "+" : ""}$${formatUsdDisplay(e)} earned`;
  }, [performance]);

  async function handleApprove(amount: bigint) {
    if (!vault || !address) return;
    setActionError(null);
    try {
      const hash = await writeContractAsync({
        address: usdc.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, amount],
      });
      setTxHash(hash);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Approve failed",
      );
    }
  }

  async function handleDeposit() {
    if (!vault || !address || !depositsEnabled) return;
    setActionError(null);
    try {
      const amount = parseUnits(depositInput || "0", usdc.decimals);
      if (amount <= zero) {
        setActionError("Enter a deposit amount.");
        return;
      }
      const currentAllowance = (allowance as bigint | undefined) ?? zero;
      if (currentAllowance < amount) {
        await handleApprove(amount);
        return;
      }
      const amountLabel = formatUsd(amount, usdc.decimals);
      const hash = await writeContractAsync({
        address: vault,
        abi: swiftPayVaultAbi,
        functionName: "deposit",
        args: [amount, address],
      });
      setPendingTxType("deposit");
      setPendingTxAmountLabel(amountLabel);
      setPendingTxAmount(formatUnits(amount, usdc.decimals));
      setTxHash(hash);
      setDepositInput("");
      await refetchShares();
      await refetchAssets();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Deposit failed",
      );
    }
  }

  async function handleWithdraw() {
    if (!vault || !address) return;
    setActionError(null);
    try {
      const amount = parseUnits(withdrawInput || "0", usdc.decimals);
      if (amount <= zero) {
        setActionError("Enter a withdrawal amount.");
        return;
      }
      const available =
        typeof maxWithdraw === "bigint"
          ? (maxWithdraw as bigint)
          : typeof earnAssets === "bigint"
            ? (earnAssets as bigint)
            : zero;
      if (amount > available) {
        setActionError(
          "Amount exceeds available balance. If liquidity is limited, reduce the amount or try again later — we will not fake an instant withdrawal.",
        );
        return;
      }
      const amountLabel = formatUsd(amount, usdc.decimals);
      const hash = await writeContractAsync({
        address: vault,
        abi: swiftPayVaultAbi,
        functionName: "withdraw",
        args: [amount, address, address],
      });
      setPendingTxType("withdraw");
      setPendingTxAmountLabel(amountLabel);
      setPendingTxAmount(formatUnits(amount, usdc.decimals));
      setTxHash(hash);
      setWithdrawInput("");
      await refetchShares();
      await refetchAssets();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Withdraw failed";
      // Surface liquidity / revert as pending-style guidance
      if (/liquidity|exceeds|ERC4626|reverted/i.test(message)) {
        setActionError(
          "Withdrawal pending or unavailable — underlying liquidity may be temporarily constrained. Your funds remain in the vault; try a smaller amount or check back shortly.",
        );
      } else {
        setActionError(message);
      }
    }
  }

  const withdrawRemaining =
    typeof earnAssets === "bigint" &&
    withdrawAmountUnits !== null &&
    withdrawAmountUnits > zero
      ? (earnAssets as bigint) > withdrawAmountUnits
        ? (earnAssets as bigint) - withdrawAmountUnits
        : 0n
      : undefined;

  const needsApprove =
    depositAmountUnits !== null &&
    depositAmountUnits > zero &&
    ((allowance as bigint | undefined) ?? zero) < depositAmountUnits;

  return (
    <PlatformAccessGate>
      <PlatformChrome
        title="Earn"
        subtitle="Put your idle USDC to work."
        actions={<PlatformProfileControls />}
      >
        <div className="earn-page">
          <EarnModeBanner mode={mode} />

          {strategyHealthy === false && (
            <div className="earn-unhealthy-banner" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <strong>Strategy health warning</strong>
                New deposits are disabled while the strategy reports unhealthy.
                Withdrawals remain available when liquidity permits. Admins have
                been notified via the health monitor.
              </div>
            </div>
          )}

          <section className="section-panel">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="section-eyebrow">SwiftPay Earn</p>
                <h1 className="section-title">Make your idle USDC work.</h1>
                <p className="section-copy">
                  Earn variable yield on your USDC while keeping your money
                  accessible. Yield comes from Aave when a live market is
                  configured — never from fake balances.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <p className="font-mono text-xs text-muted-foreground">
                  {shorten(address)}
                </p>
                <div className="earn-hero-meta">
                  <span className="earn-pill">
                    {mode === "live"
                      ? "Production"
                      : mode === "simulation"
                        ? "Simulation"
                        : "Unavailable"}
                  </span>
                  {isSimulationFlag === true && (
                    <span className="earn-pill earn-pill-warn">
                      Not real yield
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="earn-main-grid">
            <article className="earn-balance-card">
              <div className="earn-balance-header">
                <TrendingUp className="h-5 w-5" />
                <span>Earn balance</span>
              </div>
              <p className="earn-balance-value">
                ${formatUsd(earnAssets as bigint | undefined)}
              </p>
              {earnedLabel && (
                <p className="earn-balance-earned">{earnedLabel}</p>
              )}
              <p className="earn-balance-sub">
                Shares:{" "}
                {shareBalance !== undefined
                  ? Number(formatUnits(shareBalance as bigint, 18)).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 4 },
                    )
                  : "—"}
              </p>
              <div className="earn-stat-row">
                <div>
                  <p className="earn-stat-label">Vault TVL</p>
                  <p className="earn-stat-value">
                    ${formatUsd(totalAssets as bigint | undefined)}
                  </p>
                </div>
                <div>
                  <p className="earn-stat-label">Wallet USDC</p>
                  <p className="earn-stat-value">
                    ${formatUsd(walletUsdc as bigint | undefined)}
                  </p>
                </div>
                <div>
                  <p className="earn-stat-label">
                    {mode === "live" ? "Estimated net APY" : "Net APY"}
                  </p>
                  <p className="earn-stat-value">{apyDisplay}</p>
                </div>
              </div>
              <div className="earn-range-tabs" role="tablist" aria-label="APY window">
                {(["24H", "7D", "30D", "ALL"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={cn(
                      "earn-range-tab",
                      rangeTab === tab && "earn-range-tab-active",
                    )}
                    onClick={() => setRangeTab(tab)}
                    type="button"
                    role="tab"
                    aria-selected={rangeTab === tab}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {apyMessage && (
                <p className="earn-form-hint" style={{ marginTop: "0.75rem" }}>
                  {apyMessage}
                  {rangeTab !== "ALL" &&
                    " · Window tabs will use snapshot history when enough data exists."}
                </p>
              )}
              <div className="earn-actions">
                <button
                  className="earn-btn earn-btn-primary"
                  disabled={!isConnected || !depositsEnabled || busy}
                  onClick={() =>
                    setActivePanel(activePanel === "deposit" ? null : "deposit")
                  }
                  type="button"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Deposit
                </button>
                <button
                  className="earn-btn earn-btn-secondary"
                  disabled={!isConnected || !vault || busy}
                  onClick={() =>
                    setActivePanel(
                      activePanel === "withdraw" ? null : "withdraw",
                    )
                  }
                  type="button"
                >
                  <ArrowUpFromLine className="h-4 w-4" />
                  Withdraw
                </button>
              </div>

              {activePanel === "deposit" && (
                <div className="earn-form">
                  <label className="earn-label" htmlFor="deposit-amount">
                    Deposit USDC
                  </label>
                  <input
                    className="earn-input"
                    id="deposit-amount"
                    inputMode="decimal"
                    onChange={(e) => setDepositInput(e.target.value)}
                    placeholder="0.00"
                    value={depositInput}
                  />
                  <dl className="earn-form-preview">
                    <div>
                      <dt>Available</dt>
                      <dd>${formatUsd(walletUsdc as bigint | undefined)}</dd>
                    </div>
                    <div>
                      <dt>You will receive ≈</dt>
                      <dd>
                        {previewShares !== undefined
                          ? `${Number(formatUnits(previewShares as bigint, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} vault shares`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Current APY</dt>
                      <dd>{apyDisplay}</dd>
                    </div>
                    <div>
                      <dt>Strategy</dt>
                      <dd>
                        {(strategyName as string) || earnConfig.protocolName}
                      </dd>
                    </div>
                    <div>
                      <dt>Risk</dt>
                      <dd>Moderate · third-party DeFi</dd>
                    </div>
                    <div>
                      <dt>SwiftPay performance fee</dt>
                      <dd>{feePercent}% of yield</dd>
                    </div>
                  </dl>
                  <button
                    className="earn-btn earn-btn-primary w-full"
                    disabled={busy || !depositsEnabled}
                    onClick={handleDeposit}
                    type="button"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : needsApprove ? (
                      "Approve USDC"
                    ) : (
                      "Deposit USDC"
                    )}
                  </button>
                </div>
              )}

              {activePanel === "withdraw" && (
                <div className="earn-form">
                  <label className="earn-label" htmlFor="withdraw-amount">
                    Withdraw USDC
                  </label>
                  <input
                    className="earn-input"
                    id="withdraw-amount"
                    inputMode="decimal"
                    onChange={(e) => setWithdrawInput(e.target.value)}
                    placeholder="0.00"
                    value={withdrawInput}
                  />
                  <dl className="earn-form-preview">
                    <div>
                      <dt>Earn balance</dt>
                      <dd>${formatUsd(earnAssets as bigint | undefined)}</dd>
                    </div>
                    <div>
                      <dt>Available to withdraw</dt>
                      <dd>
                        $
                        {formatUsd(
                          (maxWithdraw as bigint | undefined) ??
                            (earnAssets as bigint | undefined),
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Withdrawal</dt>
                      <dd>
                        $
                        {withdrawAmountUnits !== null
                          ? formatUsd(withdrawAmountUnits)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Remaining</dt>
                      <dd>
                        $
                        {withdrawRemaining !== undefined
                          ? formatUsd(withdrawRemaining)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Estimated received</dt>
                      <dd>
                        $
                        {withdrawAmountUnits !== null
                          ? formatUsd(withdrawAmountUnits)
                          : "—"}{" "}
                        USDC
                      </dd>
                    </div>
                  </dl>
                  <p className="earn-form-hint">
                    Instant when underlying liquidity permits. If liquidity is
                    constrained we show pending status — never a fake instant
                    withdrawal.
                  </p>
                  <button
                    className="earn-btn earn-btn-secondary w-full"
                    disabled={busy}
                    onClick={handleWithdraw}
                    type="button"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Withdraw"
                    )}
                  </button>
                </div>
              )}

              {actionError && (
                <p className="earn-error">
                  <AlertCircle className="h-4 w-4" />
                  {actionError}
                </p>
              )}
              {txHash && (
                <a
                  className="earn-tx-link"
                  href={explorerTxUrl(txHash)}
                  rel="noreferrer"
                  target="_blank"
                >
                  View transaction <ExternalLink className="h-3.5 w-3.5" />
                  {isConfirmed
                    ? " · Confirmed"
                    : isConfirming
                      ? " · Pending…"
                      : ""}
                </a>
              )}
            </article>

            <PerformanceCard
              feePercent={feePercent}
              mode={mode}
              netApyDisplay={apyDisplay}
              strategyHealthy={strategyHealthy as boolean | undefined}
              strategyName={
                (strategyName as string) || earnConfig.protocolName
              }
              summary={performance}
              underlyingApyDisplay={underlyingApyDisplay}
            />
          </section>

          <YieldChart
            buildingHistory={buildingHistory && chartPoints.length === 0}
            message={historyMessage}
            points={chartPoints}
          />

          <EarnTransactions
            refreshKey={txRefreshKey}
            sessionTxs={sessionTxs}
          />

          <AutoSavePanel />

          <section className="earn-transparency">
            <h2>
              <Info className="h-4 w-4" /> Where does my money go?
            </h2>
            <ol className="earn-flow">
              <li>Your USDC</li>
              <li>SwiftPayVault (ERC-4626)</li>
              <li>Strategy adapter</li>
              <li>
                {(strategyName as string) || "Underlying USDC lending market"}
              </li>
            </ol>
            <div className="earn-address-grid">
              <AddressRow label="Network" address={null} plain="Arc" />
              <AddressRow label="Vault" address={vault} />
              <AddressRow label="Strategy" address={strategy} />
              <AddressRow
                label="Aave Pool"
                address={earnConfig.aavePoolAddress}
              />
              <AddressRow label="aToken" address={earnConfig.aTokenAddress} />
              <AddressRow label="USDC" address={usdc.address} />
            </div>
            <p className="earn-footnote" style={{ marginTop: "0.75rem" }}>
              Protocol: {earnConfig.protocolName}. Audits are only listed when
              independently verifiable — none are claimed here without sources.
            </p>
          </section>

          <section className="earn-risks">
            <h2>
              <Shield className="h-4 w-4" /> Risks
            </h2>
            <ul>
              <li>Yield is variable and not guaranteed.</li>
              <li>
                Your funds are deployed into third-party DeFi infrastructure
                (Aave when live).
              </li>
              <li>
                Smart-contract, liquidity, protocol, and market risks may apply.
              </li>
              <li>
                This product is not insured and is not a bank deposit. We do not
                claim “safe”, “risk-free”, or guaranteed APY.
              </li>
            </ul>
          </section>

          {!isConnected && (
            <div className="earn-connect-hint">
              <Wallet className="h-5 w-5" />
              <p>Connect a wallet on Arc to deposit or withdraw.</p>
            </div>
          )}

          <p className="earn-footer-link">
            <Link href="/dashboard">← Back to dashboard</Link>
          </p>
        </div>
      </PlatformChrome>
    </PlatformAccessGate>
  );
}

function AddressRow({
  label,
  address,
  plain,
}: {
  label: string;
  address?: string | null;
  plain?: string;
}) {
  if (plain && !address) {
    return (
      <div className="earn-address-row">
        <span>{label}</span>
        <span>{plain}</span>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="earn-address-row">
        <span>{label}</span>
        <span className="text-muted-foreground">Not configured</span>
      </div>
    );
  }

  return (
    <div className="earn-address-row">
      <span>{label}</span>
      <a
        className={cn("earn-address-link")}
        href={explorerAddressUrl(address)}
        rel="noreferrer"
        target="_blank"
      >
        {shorten(address)}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default function EarnPage() {
  return (
    <Suspense
      fallback={
        <PlatformAccessGate>
          <PlatformChrome
            title="Earn"
            subtitle="Put your idle USDC to work."
            actions={<PlatformProfileControls />}
          >
            <div className="earn-page">
              <p className="earn-footnote">
                <Loader2 className="inline h-4 w-4 animate-spin" /> Loading
                Earn…
              </p>
            </div>
          </PlatformChrome>
        </PlatformAccessGate>
      }
    >
      <EarnPageInner />
    </Suspense>
  );
}
