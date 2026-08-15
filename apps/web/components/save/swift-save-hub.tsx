"use client";

import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pause,
  PiggyBank,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSignMessage,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, maxUint256, type Address, type Hash } from "viem";

import { AmountConfirmDialog } from "@/components/save/amount-confirm-dialog";
import { CreatePocketDialog } from "@/components/save/create-pocket-dialog";
import {
  formatMoney,
  formatMoneyShort,
  groupByDay,
  pocketProgress,
} from "@/components/save/format";
import { SpendSaveSetupDialog } from "@/components/save/spend-save-setup-dialog";
import { KpiCard } from "@/components/design/kpi-card";
import { TokenIcon } from "@/components/token-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
  type CircleWallet,
} from "@/lib/circle-session";
import { erc20Abi } from "@/lib/contracts";
import { swiftSaveVaultAbi } from "@/lib/save/abis";
import {
  circleVaultDeposit,
  circleVaultWithdraw,
} from "@/lib/save/circle-vault";
import {
  archiveSavingsPocket,
  confirmDeposit,
  confirmWithdraw,
  disableSpendSave,
  fetchSavingsPockets,
  fetchSavingsSummary,
  fetchSavingsTransactions,
  fetchSpendSave,
  fetchSpendSaveHistory,
  initiateDeposit,
  initiateWithdraw,
  pauseSpendSave,
  resumeSpendSave,
} from "@/lib/save/client";
import {
  explorerTxUrl,
  isSwiftSaveVaultConfigured,
  SWIFT_SAVE_DISCLAIMER,
  swiftSaveVaultAddress,
} from "@/lib/save/config";
import {
  formatLockRemaining,
  formatUnlockDate,
  getPocketLockState,
} from "@/lib/save/lock";
import { executeSavingsReversal } from "@/lib/save/spend-save-browser";
import {
  getPocketEmoji,
  type SavingsPocketRecord,
  type SavingsSummary,
  type SavingsTransactionRecord,
  type SpendSaveConfigRecord,
  type SpendSaveEventRecord,
} from "@/lib/save/types";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";
import {
  fetchWalletSession,
  signInWalletSession,
} from "@/lib/wallet-auth-client";
import { arcTestnet } from "@/lib/wagmi";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function SwiftSaveHub() {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync, isPending: isSigningIn } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const circleSdkRef = useRef<W3SSdk | null>(null);

  const [authWallet, setAuthWallet] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [circleSocialUuid, setCircleSocialUuid] = useState<string | undefined>();
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(null);
  const [circleWallet, setCircleWallet] = useState<CircleWallet | null>(null);
  const [currency] = useState<ArcTokenSymbol>("USDC");
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  const [pockets, setPockets] = useState<SavingsPocketRecord[]>([]);
  const [transactions, setTransactions] = useState<SavingsTransactionRecord[]>(
    [],
  );
  const [spendSave, setSpendSave] = useState<SpendSaveConfigRecord | null>(null);
  const [spendEvents, setSpendEvents] = useState<SpendSaveEventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [amountMode, setAmountMode] = useState<"deposit" | "withdraw" | null>(
    null,
  );
  const [activePocket, setActivePocket] = useState<SavingsPocketRecord | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<Hash | undefined>();
  const [pendingConfirm, setPendingConfirm] = useState<{
    mode: "deposit" | "withdraw";
    pocketId: string;
    transactionId: string;
  } | null>(null);

  const vault = swiftSaveVaultAddress();
  const token = arcTestnetTokens[currency];
  const walletAddress = address?.toLowerCase() ?? "";

  const { data: walletTokenBalance, refetch: refetchBalance } = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(address) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      address && vault
        ? [address, vault]
        : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(address && vault) },
  });

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: pendingTxHash });

  const walletBalanceLabel = useMemo(() => {
    if (walletTokenBalance === undefined) return "—";
    return `${formatMoneyShort(formatUnits(walletTokenBalance, token.decimals))} ${currency}`;
  }, [walletTokenBalance, token.decimals, currency]);

  const isWalletAuthenticated =
    Boolean(authWallet) &&
    Boolean(address) &&
    authWallet === address?.toLowerCase();

  const loadAll = useCallback(async () => {
    const owner = address;
    if (!owner) {
      setSummary(null);
      setPockets([]);
      setTransactions([]);
      setSpendSave(null);
      setSpendEvents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const social =
        getCircleLoginIdentity(readCircleLogin())?.socialUserUUID ?? undefined;
      setCircleSocialUuid(social);

      const [summaryRes, pocketsRes, txRes, spendRes, eventsRes] =
        await Promise.all([
          fetchSavingsSummary(owner, currency, social),
          fetchSavingsPockets(owner, { circleSocialUuid: social }),
          fetchSavingsTransactions(owner, { circleSocialUuid: social }),
          fetchSpendSave(owner, social),
          fetchSpendSaveHistory(owner, social),
        ]);

      setSummary(summaryRes.summary);
      setPockets(pocketsRes.pockets);
      setTransactions(txRes.transactions);
      setSpendSave(spendRes.config);
      setSpendEvents(eventsRes.events);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [address, currency]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Circle embedded wallet session (for vault deposit/withdraw without external signer)
  useEffect(() => {
    const login = readCircleLogin();
    setCircleLogin(login);
    const wallets = readCircleWallets();
    const primary =
      wallets.find((w) => w.address?.toLowerCase() === address?.toLowerCase()) ??
      wallets[0] ??
      null;
    setCircleWallet(primary);

    if (!login) {
      circleSdkRef.current = null;
      return;
    }

    let cancelled = false;
    void import("@circle-fin/w3s-pw-web-sdk")
      .then(({ W3SSdk }) => {
        if (cancelled) return;
        circleSdkRef.current = new W3SSdk();
      })
      .catch(() => {
        if (!cancelled) circleSdkRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const isCircleMode = Boolean(
    circleLogin && circleWallet?.id && circleSdkRef.current,
  );

  useEffect(() => {
    let cancelled = false;
    async function syncSession() {
      if (!address) {
        setAuthWallet(null);
        return;
      }
      try {
        const session = await fetchWalletSession();
        if (cancelled) return;
        if (
          session.authenticated &&
          session.ownerWallet?.toLowerCase() === address.toLowerCase()
        ) {
          setAuthWallet(session.ownerWallet.toLowerCase());
        } else {
          setAuthWallet(null);
        }
      } catch {
        if (!cancelled) setAuthWallet(null);
      }
    }
    void syncSession();
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (!isConfirmed || !pendingConfirm || !pendingTxHash || !address) return;

    const confirm = pendingConfirm;
    const owner = address;
    const hash = pendingTxHash;
    let cancelled = false;

    async function finalize() {
      try {
        setIsActing(true);
        if (confirm.mode === "deposit") {
          await confirmDeposit(confirm.pocketId, {
            ownerWallet: owner,
            circleSocialUuid,
            transactionId: confirm.transactionId,
            txHash: hash,
          });
          setSuccess("Deposit confirmed on-chain and pocket updated.");
        } else {
          await confirmWithdraw(confirm.pocketId, {
            ownerWallet: owner,
            circleSocialUuid,
            transactionId: confirm.transactionId,
            txHash: hash,
          });
          setSuccess("Withdrawal confirmed on-chain and pocket updated.");
        }
        setAmountMode(null);
        setActivePocket(null);
        setPendingConfirm(null);
        setPendingTxHash(undefined);
        await loadAll();
        void refetchBalance();
      } catch (err) {
        if (!cancelled) setActionError(getErrorMessage(err));
      } finally {
        if (!cancelled) setIsActing(false);
      }
    }
    void finalize();
    return () => {
      cancelled = true;
    };
  }, [
    isConfirmed,
    pendingConfirm,
    pendingTxHash,
    address,
    circleSocialUuid,
    loadAll,
    refetchBalance,
  ]);

  async function ensureArcNetwork() {
    if (chainId === arcTestnet.id) return true;
    try {
      await switchChainAsync({ chainId: arcTestnet.id });
      return true;
    } catch (err) {
      setError(getErrorMessage(err));
      return false;
    }
  }

  async function handleWalletSignIn() {
    if (!address || !connector) {
      setError("Connect a wallet first.");
      return;
    }
    try {
      setIsAuthLoading(true);
      setError(null);
      await signInWalletSession({
        ownerWallet: address,
        connectorName: connector.name,
        signMessage: async (message) =>
          signMessageAsync({ message, account: address }),
      });
      setAuthWallet(address.toLowerCase());
      setSuccess("Wallet authorized for Swift+Save.");
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function ensureAllowance(amountUnits: bigint) {
    if (!address || !vault) {
      throw new Error("SwiftSaveVault is not configured.");
    }
    const current = (allowance as bigint | undefined) ?? 0n;
    if (current >= amountUnits) return;

    const hash = await writeContractAsync({
      address: token.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, maxUint256],
      chainId: arcTestnet.id,
    });
    setPendingTxHash(hash);
    // Wait via receipt hook is async; for approve we poll simply via refetch after short wait
    await new Promise((r) => setTimeout(r, 4000));
    await refetchAllowance();
  }

  function buildCircleExecutor() {
    if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
      throw new Error("Circle wallet is not ready.");
    }
    const login = circleLogin;
    const walletId = circleWallet.id;
    const sdk = circleSdkRef.current;
    return {
      login,
      walletId,
      executeChallenge: async (challengeId: string) => {
        sdk.setAuthentication({
          encryptionKey: login.encryptionKey,
          userToken: login.userToken,
        });
        return new Promise<{ transactionId?: string; txHash?: string }>(
          (resolve, reject) => {
            sdk.execute(challengeId, (error, result) => {
              if (error) {
                reject(new Error(getErrorMessage(error)));
                return;
              }
              const challengeResult = result as
                | { data?: { transactionId?: string; txHash?: string } }
                | undefined;
              resolve({
                transactionId: challengeResult?.data?.transactionId,
                txHash: challengeResult?.data?.txHash,
              });
            });
          },
        );
      },
    };
  }

  async function handleAmountConfirm(amount: string) {
    if (!address || !activePocket || !amountMode) return;
    setActionError(null);
    setSuccess(null);

    if (!isSwiftSaveVaultConfigured()) {
      setActionError(
        "Deploy SwiftSaveVault and set NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS.",
      );
      return;
    }

    if (amountMode === "withdraw") {
      const blocked = getPocketLockState(activePocket);
      if (blocked.locked) {
        setActionError(
          `This pocket is locked until ${formatUnlockDate(blocked.until)}.`,
        );
        return;
      }
    }

    if (!isCircleMode && !(await ensureArcNetwork())) return;

    try {
      setIsActing(true);
      if (amountMode === "deposit") {
        const prepared = await initiateDeposit(activePocket.id, {
          ownerWallet: address,
          circleSocialUuid,
          amount,
        });
        if (!prepared.vaultAddress) {
          throw new Error("Vault address missing from deposit prepare.");
        }
        const amountUnits = BigInt(prepared.amountUnits);

        if (isCircleMode) {
          setSuccess("Confirm deposit in Circle wallet…");
          const result = await circleVaultDeposit({
            executor: buildCircleExecutor(),
            vault: prepared.vaultAddress as Address,
            token: prepared.tokenAddress as Address,
            pocketIdBytes32: prepared.pocketIdBytes32 as `0x${string}`,
            amountUnits,
          });
          if (!result.txHash) {
            throw new Error(
              "Circle deposit submitted without a hash yet. Check again shortly — reconciliation will finalize it.",
            );
          }
          await confirmDeposit(activePocket.id, {
            ownerWallet: address,
            circleSocialUuid,
            transactionId: prepared.transaction.id,
            txHash: result.txHash,
          });
          setSuccess("Nice! Money was added to your pocket.");
          setAmountMode(null);
          setActivePocket(null);
          await loadAll();
          void refetchBalance();
        } else {
          await ensureAllowance(amountUnits);
          const hash = await writeContractAsync({
            address: prepared.vaultAddress as Address,
            abi: swiftSaveVaultAbi,
            functionName: "deposit",
            args: [
              prepared.pocketIdBytes32 as `0x${string}`,
              prepared.tokenAddress as Address,
              amountUnits,
            ],
            chainId: arcTestnet.id,
          });
          setPendingTxHash(hash);
          setPendingConfirm({
            mode: "deposit",
            pocketId: activePocket.id,
            transactionId: prepared.transaction.id,
          });
          setSuccess("Deposit submitted — waiting for confirmation…");
        }
      } else {
        const prepared = await initiateWithdraw(activePocket.id, {
          ownerWallet: address,
          circleSocialUuid,
          amount,
        });
        if (!prepared.vaultAddress) {
          throw new Error("Vault address missing from withdraw prepare.");
        }
        const amountUnits = BigInt(prepared.amountUnits);

        if (isCircleMode) {
          setSuccess("Confirm withdrawal in Circle wallet…");
          const result = await circleVaultWithdraw({
            executor: buildCircleExecutor(),
            vault: prepared.vaultAddress as Address,
            token: prepared.tokenAddress as Address,
            pocketIdBytes32: prepared.pocketIdBytes32 as `0x${string}`,
            amountUnits,
          });
          if (!result.txHash) {
            throw new Error(
              "Circle withdrawal submitted without a hash yet. Check again shortly.",
            );
          }
          await confirmWithdraw(activePocket.id, {
            ownerWallet: address,
            circleSocialUuid,
            transactionId: prepared.transaction.id,
            txHash: result.txHash,
          });
          setSuccess("Withdrawal confirmed — funds are back in your wallet.");
          setAmountMode(null);
          setActivePocket(null);
          await loadAll();
          void refetchBalance();
        } else {
          const hash = await writeContractAsync({
            address: prepared.vaultAddress as Address,
            abi: swiftSaveVaultAbi,
            functionName: "withdraw",
            args: [
              prepared.pocketIdBytes32 as `0x${string}`,
              prepared.tokenAddress as Address,
              amountUnits,
            ],
            chainId: arcTestnet.id,
          });
          setPendingTxHash(hash);
          setPendingConfirm({
            mode: "withdraw",
            pocketId: activePocket.id,
            transactionId: prepared.transaction.id,
          });
          setSuccess("Withdrawal submitted — waiting for confirmation…");
        }
      }
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setIsActing(false);
    }
  }

  async function handleReverseSpendSave(tx: SavingsTransactionRecord) {
    if (!address) return;
    if (tx.type !== "SPEND_SAVE" || tx.status !== "COMPLETED") return;
    setError(null);
    try {
      setIsActing(true);
      setSuccess("Reversing savings for refunded payment…");
      await executeSavingsReversal({
        ownerWallet: address,
        originalTransactionId: tx.id,
        circleSocialUuid,
        mode: isCircleMode ? "circle" : "external",
        chainId: arcTestnet.id,
        writeContractAsync: isCircleMode
          ? undefined
          : async (args) =>
              writeContractAsync({
                address: args.address,
                abi: args.abi,
                functionName: args.functionName as "withdraw",
                args: args.args as never,
                chainId: args.chainId,
              }),
        circleExecutor: isCircleMode ? buildCircleExecutor() : undefined,
        reason: "payment_refund",
      });
      setSuccess(
        "Refund reversal completed. The savings amount is back in your spendable balance.",
      );
      await loadAll();
      void refetchBalance();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsActing(false);
    }
  }

  async function handleArchive(pocket: SavingsPocketRecord) {
    if (!address) return;
    setError(null);
    try {
      await archiveSavingsPocket(pocket.id, {
        ownerWallet: address,
        circleSocialUuid,
      });
      setSuccess(`Archived ${pocket.name}.`);
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleSpendSaveControl(mode: "pause" | "resume" | "disable") {
    if (!address) return;
    setError(null);
    try {
      const body = { ownerWallet: address, circleSocialUuid };
      if (mode === "pause") await pauseSpendSave(body);
      else if (mode === "resume") await resumeSpendSave(body);
      else await disableSpendSave(body);
      setSuccess(
        mode === "pause"
          ? "Spend&Save paused."
          : mode === "resume"
            ? "Spend&Save resumed."
            : "Spend&Save disabled. Existing savings are untouched.",
      );
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const spendSaveActive = Boolean(spendSave?.enabled);
  const spendSavePct = spendSave ? Number(spendSave.percentage) : null;
  const spendSavePocket = pockets.find((p) => p.id === spendSave?.pocket_id);

  if (!isConnected || !address) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <PiggyBank className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 text-lg font-semibold">Connect to use Swift+Save</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Google or an external wallet to create savings pockets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-primary/10 via-background to-background p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Non-interest savings
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Build your savings, one payment at a time.
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Put money aside for something. Create a savings pocket, or save a
              little automatically whenever you spend.
            </p>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {SWIFT_SAVE_DISCLAIMER}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isWalletAuthenticated ? (
              <Button
                disabled={isAuthLoading || isSigningIn}
                onClick={() => void handleWalletSignIn()}
                type="button"
                variant="outline"
              >
                {isAuthLoading || isSigningIn ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Authorize wallet
              </Button>
            ) : (
              <Badge variant="secondary" className="h-9 px-3">
                Authorized
              </Badge>
            )}
            <Button
              disabled={!isWalletAuthenticated}
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create savings pocket
            </Button>
            <Button
              disabled={!isWalletAuthenticated}
              onClick={() => setSetupOpen(true)}
              type="button"
              variant="outline"
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Set up Spend&Save
            </Button>
          </div>
        </div>
      </div>

      {!isSwiftSaveVaultConfigured() ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-50">
          Vault not configured. Deploy with{" "}
          <code className="rounded bg-black/10 px-1">
            pnpm --filter @swiftpay/contracts deploy:swiftsave
          </code>{" "}
          and set{" "}
          <code className="rounded bg-black/10 px-1">
            NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS
          </code>
          . Pockets and Spend&Save config still work; deposits need the vault.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-100">
          {success}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={PiggyBank}
          label="Total Saved"
          value={
            isLoading ? (
              <span className="inline-block h-7 w-24 animate-pulse rounded bg-muted" />
            ) : (
              formatMoney(summary?.totalSaved ?? "0", currency)
            )
          }
        />
        <KpiCard
          icon={Sparkles}
          label="This Month"
          change={
            !isLoading && summary
              ? `+${formatMoneyShort(summary.monthSaved)}`
              : undefined
          }
          changeTone="positive"
          value={
            isLoading ? (
              <span className="inline-block h-7 w-20 animate-pulse rounded bg-muted" />
            ) : (
              formatMoney(summary?.monthSaved ?? "0", currency)
            )
          }
        />
        <KpiCard
          icon={Wallet}
          label="Savings Pockets"
          value={
            isLoading ? (
              <span className="inline-block h-7 w-8 animate-pulse rounded bg-muted" />
            ) : (
              String(summary?.pocketCount ?? 0)
            )
          }
        />
        <KpiCard
          icon={Wallet}
          label="Spend&Save"
          value={
            isLoading ? (
              <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" />
            ) : spendSaveActive && spendSavePct != null ? (
              <span className="inline-flex items-center gap-2">
                {spendSavePct}%
                <Badge>ACTIVE</Badge>
              </span>
            ) : spendSave ? (
              "Off"
            ) : (
              "Not set up"
            )
          }
        />
      </div>

      {/* Spend&Save status card */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-lg">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Spend&Save</h2>
              <Badge variant={spendSaveActive ? "default" : "secondary"}>
                {spendSaveActive
                  ? "ACTIVE"
                  : spendSave
                    ? "PAUSED"
                    : "OFF"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatically save while you spend.
            </p>
            {spendSaveActive && spendSavePct != null && spendSavePocket ? (
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  <span className="font-semibold text-foreground">
                    {spendSavePct}%
                  </span>{" "}
                  → {spendSavePocket.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Example: Spend $100 → Save $
                  {((100 * spendSavePct) / 100).toFixed(2)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Choose how much you want to save whenever you spend.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!isWalletAuthenticated}
              onClick={() => setSetupOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              {spendSave ? "Edit" : "Set up"}
            </Button>
            {spendSave ? (
              spendSaveActive ? (
                <Button
                  onClick={() => void handleSpendSaveControl("pause")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Pause className="mr-1.5 h-3.5 w-3.5" />
                  Pause
                </Button>
              ) : (
                <Button
                  onClick={() => void handleSpendSaveControl("resume")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Resume
                </Button>
              )
            ) : null}
            {spendSave ? (
              <Button
                onClick={() => void handleSpendSaveControl("disable")}
                size="sm"
                type="button"
                variant="ghost"
              >
                Disable
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Pockets grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Pockets</h2>
          {pockets.length > 0 ? (
            <Button
              disabled={!isWalletAuthenticated}
              onClick={() => setCreateOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New pocket
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                className="h-44 animate-pulse rounded-2xl border border-border/60 bg-muted/40"
                key={i}
              />
            ))}
          </div>
        ) : pockets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <PiggyBank className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-4 text-lg font-semibold">
              Your savings journey starts here.
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Create a pocket for anything you’re saving towards — emergency
              fund, vacation, laptop, rent, or a personal goal.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button
                disabled={!isWalletAuthenticated}
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create your first pocket
              </Button>
              <Button
                disabled={!isWalletAuthenticated}
                onClick={() => setSetupOpen(true)}
                type="button"
                variant="outline"
              >
                Learn about Spend&Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pockets.map((pocket) => {
              const progress = pocketProgress(pocket);
              const lockState = getPocketLockState(pocket);
              const goalReached =
                pocket.target_amount_units &&
                BigInt(pocket.current_balance_units || "0") >=
                  BigInt(pocket.target_amount_units);
              return (
                <article
                  className="group flex flex-col rounded-2xl border border-border/80 bg-card p-4 transition hover:border-primary/30"
                  key={pocket.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-2xl">
                        {getPocketEmoji(pocket.icon)}
                      </div>
                      <div>
                        <Link
                          className="font-semibold hover:text-primary"
                          href={`/save/${pocket.id}`}
                        >
                          {pocket.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {pocket.description || "No goal note"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {lockState.kind === "fixed" && lockState.locked ? (
                        <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200">
                          Locked · {formatLockRemaining(lockState.remainingMs)}
                        </Badge>
                      ) : lockState.kind === "fixed" ? (
                        <Badge variant="secondary">Unlocked</Badge>
                      ) : (
                        <Badge variant="outline">Flexible</Badge>
                      )}
                      {goalReached ? (
                        <Badge className="shrink-0">Goal reached!</Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xl font-semibold tracking-tight">
                      {formatMoney(pocket.current_balance, pocket.currency)}
                    </p>
                    {goalReached && pocket.target_amount ? (
                      <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Your {pocket.name} is fully funded.
                      </p>
                    ) : null}
                    {pocket.target_amount ? (
                      <>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatMoneyShort(pocket.current_balance)} /{" "}
                          {formatMoneyShort(pocket.target_amount)}
                          {progress != null ? ` · ${progress}% complete` : null}
                        </p>
                        <Progress className="mt-2" value={progress ?? 0} />
                        {pocket.stop_at_target ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Stops auto-save at target
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Continues beyond target
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatMoneyShort(pocket.current_balance)} saved · No
                        target
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      disabled={!isWalletAuthenticated}
                      onClick={() => {
                        setActivePocket(pocket);
                        setAmountMode("deposit");
                        setActionError(null);
                      }}
                      size="sm"
                      type="button"
                    >
                      <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                      Add money
                    </Button>
                    <Button
                      disabled={
                        !isWalletAuthenticated || lockState.locked
                      }
                      onClick={() => {
                        if (lockState.locked) {
                          setError(
                            `“${pocket.name}” is locked until ${formatUnlockDate(lockState.until)}.`,
                          );
                          return;
                        }
                        setActivePocket(pocket);
                        setAmountMode("withdraw");
                        setActionError(null);
                      }}
                      size="sm"
                      title={
                        lockState.locked
                          ? `Locked until ${formatUnlockDate(lockState.until)}`
                          : "Withdraw"
                      }
                      type="button"
                      variant="outline"
                    >
                      {lockState.locked ? (
                        <LockKeyhole className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {lockState.locked ? "Locked" : "Withdraw"}
                    </Button>
                    <Button asChild size="sm" type="button" variant="ghost">
                      <Link href={`/save/${pocket.id}`}>Details</Link>
                    </Button>
                    <Button
                      disabled={!isWalletAuthenticated}
                      onClick={() => void handleArchive(pocket)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Spend&Save history */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Spend&Save history</h2>
        {spendEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No automatic savings yet. Activate Spend&Save and make an eligible
            payment.
          </p>
        ) : (
          <div className="space-y-4">
            {groupByDay(spendEvents).map(([day, events]) => (
              <div key={day}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {day}
                </p>
                <div className="space-y-2">
                  {events.map((event) => {
                    const pocket = pockets.find((p) => p.id === event.pocket_id);
                    return (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-sm"
                        key={event.id}
                      >
                        <div>
                          <p className="font-medium">
                            {formatMoneyShort(event.payment_amount)} spent ·{" "}
                            {formatMoneyShort(event.save_amount)} saved
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {Number(event.save_percentage)}% →{" "}
                            {pocket?.name ?? "Pocket"} · {event.status}
                          </p>
                        </div>
                        {event.payment_tx_hash ? (
                          <a
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            href={explorerTxUrl(event.payment_tx_hash)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Payment tx
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Unified savings history */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Savings activity</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Deposits, withdrawals, and Spend&Save transfers will appear here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/80">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Tx</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 30).map((tx) => (
                  <tr className="border-t border-border/60" key={tx.id}>
                    <td className="px-3 py-2 font-medium">{tx.type}</td>
                    <td className="px-3 py-2">
                      {formatMoney(tx.amount, tx.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          tx.status === "COMPLETED" ? "default" : "secondary"
                        }
                      >
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {tx.tx_hash ? (
                        <a
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          href={explorerTxUrl(tx.tx_hash)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {tx.type === "SPEND_SAVE" &&
                      tx.status === "COMPLETED" &&
                      isWalletAuthenticated ? (
                        <Button
                          disabled={isActing}
                          onClick={() => void handleReverseSpendSave(tx)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Reverse refund
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreatePocketDialog
        circleSocialUuid={circleSocialUuid}
        onCreated={async (pocket) => {
          setSuccess(`Created ${pocket.name}.`);
          await loadAll();
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
        ownerWallet={address}
        currency={currency}
      />

      <SpendSaveSetupDialog
        circleSocialUuid={circleSocialUuid}
        onOpenChange={setSetupOpen}
        onPocketsChange={setPockets}
        onSaved={async () => {
          setSuccess("Spend&Save activated.");
          await loadAll();
        }}
        open={setupOpen}
        ownerWallet={address}
        pockets={pockets}
      />

      {activePocket && amountMode ? (
        <AmountConfirmDialog
          currency={activePocket.currency}
          error={actionError}
          isSubmitting={
            isActing || isWritePending || isConfirming || Boolean(pendingConfirm)
          }
          mode={amountMode}
          onConfirm={(amount) => void handleAmountConfirm(amount)}
          onOpenChange={(open) => {
            if (!open) {
              setAmountMode(null);
              setActivePocket(null);
              setActionError(null);
            }
          }}
          open={Boolean(amountMode)}
          pocketBalance={activePocket.current_balance}
          pocketName={activePocket.name}
          walletBalanceLabel={walletBalanceLabel}
        />
      ) : null}

    </div>
  );
}
