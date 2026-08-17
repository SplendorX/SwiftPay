"use client";

import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  ExternalLink,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
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
import { formatMoney, formatMoneyShort, pocketProgress } from "@/components/save/format";
import { PocketLockPanel } from "@/components/save/pocket-lock-panel";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PagedActivityBox } from "@/components/ui/paged-activity-box";
import { Progress } from "@/components/ui/progress";
import {
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
} from "@/lib/circle-session";
import { erc20Abi } from "@/lib/contracts";
import {
  circleVaultDeposit,
  circleVaultWithdraw,
} from "@/lib/save/circle-vault";
import { swiftSaveVaultAbi } from "@/lib/save/abis";
import {
  archiveSavingsPocket,
  confirmDeposit,
  confirmWithdraw,
  fetchSavingsPocket,
  initiateDeposit,
  initiateWithdraw,
  updateSavingsPocket,
} from "@/lib/save/client";
import {
  explorerTxUrl,
  isSwiftSaveVaultConfigured,
} from "@/lib/save/config";
import {
  formatUnlockDate,
  getPocketLockState,
} from "@/lib/save/lock";
import {
  getPocketEmoji,
  type SavingsPocketRecord,
  type SavingsTransactionRecord,
  type SpendSaveConfigRecord,
} from "@/lib/save/types";
import { arcTestnetTokens } from "@/lib/tokens";
import {
  fetchWalletSession,
  signInWalletSession,
} from "@/lib/wallet-auth-client";
import {
  extractCircleTransactionId,
  extractCircleTxHash,
} from "@/lib/circle-tx";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { arcTestnet } from "@/lib/wagmi";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export default function SavingsPocketDetailPage() {
  const params = useParams<{ id: string }>();
  const pocketId = params.id;
  const { address: wagmiAddress, connector } = useAccount();
  const {
    address: platformAddress,
    isConnected,
    source,
  } = usePlatformWallet();
  const address = (platformAddress ?? wagmiAddress) as Address | undefined;
  const chainId = useChainId();
  const { signMessageAsync, isPending: isSigningIn } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const circleSdkRef = useRef<W3SSdk | null>(null);
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(null);
  const [circleSdkReady, setCircleSdkReady] = useState(false);

  const [authWallet, setAuthWallet] = useState<string | null>(null);
  const [circleSocialUuid, setCircleSocialUuid] = useState<string | undefined>();
  const [pocket, setPocket] = useState<SavingsPocketRecord | null>(null);
  const [stats, setStats] = useState<{
    totalDeposits: string;
    totalWithdrawals: string;
    lastDepositAt: string | null;
  } | null>(null);
  const [spendSave, setSpendSave] = useState<SpendSaveConfigRecord | null>(null);
  const [transactions, setTransactions] = useState<SavingsTransactionRecord[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStopAtTarget, setEditStopAtTarget] = useState(false);
  const [amountMode, setAmountMode] = useState<"deposit" | "withdraw" | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<Hash | undefined>();
  const [pendingConfirm, setPendingConfirm] = useState<{
    mode: "deposit" | "withdraw";
    transactionId: string;
  } | null>(null);

  const currency = pocket?.currency ?? "USDC";
  const token = arcTestnetTokens[currency];

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
      address && isSwiftSaveVaultConfigured()
        ? [
            address,
            process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS as Address,
          ]
        : undefined,
    chainId: arcTestnet.id,
    query: {
      enabled: Boolean(address && isSwiftSaveVaultConfigured()),
    },
  });

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: pendingTxHash });

  const walletBalanceLabel = useMemo(() => {
    if (walletTokenBalance === undefined) return "—";
    return `${formatMoneyShort(formatUnits(walletTokenBalance, token.decimals))} ${currency}`;
  }, [walletTokenBalance, token.decimals, currency]);

  const isWalletAuthenticated =
    source === "embedded" ||
    (Boolean(authWallet) &&
      Boolean(address) &&
      authWallet === address?.toLowerCase());

  const load = useCallback(async () => {
    const owner = address;
    if (!owner || !pocketId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const social =
        getCircleLoginIdentity(readCircleLogin())?.socialUserUUID ?? undefined;
      setCircleSocialUuid(social);
      const data = await fetchSavingsPocket(pocketId, owner, social);
      setPocket(data.pocket);
      setStats(data.stats);
      setSpendSave(data.spendSave);
      setTransactions(data.transactions);
      setEditName(data.pocket.name);
      setEditTarget(data.pocket.target_amount ?? "");
      setEditDescription(data.pocket.description ?? "");
      setEditStopAtTarget(Boolean(data.pocket.stop_at_target));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [address, pocketId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    const login = readCircleLogin();
    setCircleLogin(login);
    if (!login?.userToken || !login.encryptionKey) {
      circleSdkRef.current = null;
      setCircleSdkReady(false);
      return;
    }

    const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() ?? "";
    if (!appId) {
      circleSdkRef.current = null;
      setCircleSdkReady(false);
      return;
    }

    let cancelled = false;
    void import("@circle-fin/w3s-pw-web-sdk")
      .then(({ W3SSdk: CircleW3SSdk }) => {
        if (cancelled) return;
        circleSdkRef.current = new CircleW3SSdk({
          appSettings: { appId },
          authentication: {
            encryptionKey: login.encryptionKey,
            userToken: login.userToken,
          },
        });
        setCircleSdkReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          circleSdkRef.current = null;
          setCircleSdkReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const isCircleMode = Boolean(
    circleLogin && readCircleWallets()[0]?.id && circleSdkReady,
  );

  useEffect(() => {
    if (!isConfirmed || !pendingConfirm || !pendingTxHash || !address || !pocket)
      return;

    const confirm = pendingConfirm;
    const owner = address;
    const hash = pendingTxHash;
    const pocketRef = pocket;
    let cancelled = false;

    async function finalize() {
      try {
        setIsActing(true);
        if (confirm.mode === "deposit") {
          await confirmDeposit(pocketRef.id, {
            ownerWallet: owner,
            circleSocialUuid,
            transactionId: confirm.transactionId,
            txHash: hash,
          });
          setSuccess("Deposit confirmed.");
        } else {
          await confirmWithdraw(pocketRef.id, {
            ownerWallet: owner,
            circleSocialUuid,
            transactionId: confirm.transactionId,
            txHash: hash,
          });
          setSuccess("Withdrawal confirmed.");
        }
        setAmountMode(null);
        setPendingConfirm(null);
        setPendingTxHash(undefined);
        await load();
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
    pocket,
    circleSocialUuid,
    load,
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
    if (!address || !connector) return;
    try {
      await signInWalletSession({
        ownerWallet: address,
        connectorName: connector.name,
        signMessage: async (message) =>
          signMessageAsync({ message, account: address }),
      });
      setAuthWallet(address.toLowerCase());
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function ensureAllowance(amountUnits: bigint, vault: Address) {
    if (!address) throw new Error("Wallet not connected.");
    const current = (allowance as bigint | undefined) ?? 0n;
    if (current >= amountUnits) return;
    await writeContractAsync({
      address: token.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, maxUint256],
      chainId: arcTestnet.id,
    });
    await new Promise((r) => setTimeout(r, 4000));
    await refetchAllowance();
  }

  async function handleAmountConfirm(amount: string) {
    if (!address || !pocket || !amountMode) return;
    setActionError(null);
    if (!isSwiftSaveVaultConfigured()) {
      setActionError("SwiftSaveVault is not configured.");
      return;
    }
    if (amountMode === "withdraw") {
      const blocked = getPocketLockState(pocket);
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
      const circleWallet = readCircleWallets()[0];
      const buildCircleExecutor = () => {
        if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
          throw new Error("Circle wallet is not ready.");
        }
        const login = circleLogin;
        const sdk = circleSdkRef.current;
        return {
          login,
          walletId: circleWallet.id,
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
                  resolve({
                    transactionId: extractCircleTransactionId(result),
                    txHash: extractCircleTxHash(result),
                  });
                });
              },
            );
          },
        };
      };

      if (amountMode === "deposit") {
        const prepared = await initiateDeposit(pocket.id, {
          ownerWallet: address,
          circleSocialUuid,
          amount,
        });
        const amountUnits = BigInt(prepared.amountUnits);
        if (isCircleMode) {
          const result = await circleVaultDeposit({
            executor: buildCircleExecutor(),
            vault: prepared.vaultAddress as Address,
            token: prepared.tokenAddress as Address,
            pocketIdBytes32: prepared.pocketIdBytes32 as `0x${string}`,
            amountUnits,
          });
          if (!result.txHash) {
            throw new Error(
              "Circle deposit submitted without a hash yet. Check again shortly.",
            );
          }
          await confirmDeposit(pocket.id, {
            ownerWallet: address,
            circleSocialUuid,
            transactionId: prepared.transaction.id,
            txHash: result.txHash,
          });
          setSuccess("Nice! Money was added to your pocket.");
          setAmountMode(null);
          await load();
          void refetchBalance();
        } else {
          await ensureAllowance(amountUnits, prepared.vaultAddress as Address);
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
            transactionId: prepared.transaction.id,
          });
        }
      } else {
        const prepared = await initiateWithdraw(pocket.id, {
          ownerWallet: address,
          circleSocialUuid,
          amount,
        });
        const amountUnits = BigInt(prepared.amountUnits);
        if (isCircleMode) {
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
          await confirmWithdraw(pocket.id, {
            ownerWallet: address,
            circleSocialUuid,
            transactionId: prepared.transaction.id,
            txHash: result.txHash,
          });
          setSuccess("Withdrawal confirmed on-chain and pocket updated.");
          setAmountMode(null);
          await load();
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
            transactionId: prepared.transaction.id,
          });
        }
      }
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setIsActing(false);
    }
  }

  async function handleSaveEdit() {
    if (!address || !pocket) return;
    try {
      setIsActing(true);
      const { pocket: updated } = await updateSavingsPocket(pocket.id, {
        ownerWallet: address,
        circleSocialUuid,
        name: editName,
        description: editDescription || null,
        targetAmount: editTarget || null,
        stopAtTarget: editTarget ? editStopAtTarget : false,
      });
      setPocket(updated);
      setEditing(false);
      setSuccess("Pocket updated.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsActing(false);
    }
  }

  async function handleLock(input: {
    lockDays?: number;
    lockUntil?: string;
  }) {
    if (!address || !pocket) return;
    try {
      setIsActing(true);
      setError(null);
      const { pocket: next } = await updateSavingsPocket(pocket.id, {
        ownerWallet: address,
        circleSocialUuid,
        lockKind: "fixed",
        lockDays: input.lockDays,
        lockUntil: input.lockUntil,
      });
      setPocket(next);
      setSuccess(
        input.lockUntil
          ? `Pocket locked until ${formatUnlockDate(input.lockUntil)}.`
          : `Pocket locked for ${input.lockDays} days.`,
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsActing(false);
    }
  }

  async function handleArchive() {
    if (!address || !pocket) return;
    try {
      await archiveSavingsPocket(pocket.id, {
        ownerWallet: address,
        circleSocialUuid,
      });
      setSuccess("Pocket archived.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const progress = pocket ? pocketProgress(pocket) : null;
  const lockState = pocket ? getPocketLockState(pocket) : null;
  const remaining =
    pocket?.target_amount_units && pocket
      ? Math.max(
          0,
          Number(pocket.target_amount) - Number(pocket.current_balance),
        )
      : null;

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Pocket detail"
        title="Swift+Save"
      >
        <div className="space-y-6">
          <Button asChild size="sm" variant="ghost">
            <Link href="/save">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Swift+Save
            </Link>
          </Button>

          {!isConnected || !address ? (
            <p className="text-sm text-muted-foreground">
              Connect a wallet to view this pocket.
            </p>
          ) : isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !pocket ? (
            <p className="text-sm text-rose-600">
              {error ?? "Pocket not found."}
            </p>
          ) : (
            <>
              {error ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm">
                  {error}
                </div>
              ) : null}
              {success ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
                  {success}
                </div>
              ) : null}

              <div className="rounded-2xl border border-border/80 bg-card p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-4xl">
                      {getPocketEmoji(pocket.icon)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-semibold">{pocket.name}</h1>
                        <Badge
                          variant={
                            pocket.status === "active" ? "default" : "secondary"
                          }
                        >
                          {pocket.status}
                        </Badge>
                        {lockState?.kind === "fixed" && lockState.locked ? (
                          <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200">
                            Fixed · locked
                          </Badge>
                        ) : lockState?.kind === "fixed" ? (
                          <Badge variant="secondary">Fixed · unlocked</Badge>
                        ) : (
                          <Badge variant="secondary">Flexible</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {pocket.description || "No goal note"}
                      </p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight">
                        {formatMoney(pocket.current_balance, pocket.currency)}
                      </p>
                      {pocket.target_amount &&
                      progress != null &&
                      progress >= 100 ? (
                        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
                          <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                            Goal reached!
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Your {pocket.name} is fully funded.
                          </p>
                        </div>
                      ) : null}
                      {pocket.target_amount ? (
                        <div className="mt-3 max-w-sm">
                          <p className="text-xs text-muted-foreground">
                            {formatMoneyShort(pocket.current_balance)} /{" "}
                            {formatMoneyShort(pocket.target_amount)} ·{" "}
                            {progress ?? 0}% complete
                            {remaining != null && remaining > 0
                              ? ` · ${formatMoneyShort(remaining.toFixed(2))} remaining`
                              : null}
                          </p>
                          <Progress className="mt-2" value={progress ?? 0} />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {pocket.stop_at_target
                              ? "Stops auto-save when target is reached"
                              : "Continues saving beyond target"}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatMoneyShort(pocket.current_balance)} saved · no
                          target set
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!isWalletAuthenticated ? (
                      <Button
                        disabled={isSigningIn}
                        onClick={() => void handleWalletSignIn()}
                        type="button"
                        variant="outline"
                      >
                        <KeyRound className="mr-2 h-4 w-4" />
                        Authorize
                      </Button>
                    ) : null}
                    <Button
                      disabled={
                        !isWalletAuthenticated || pocket.status !== "active"
                      }
                      onClick={() => {
                        setAmountMode("deposit");
                        setActionError(null);
                      }}
                      type="button"
                    >
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      Add money
                    </Button>
                    <Button
                      disabled={
                        !isWalletAuthenticated ||
                        pocket.status !== "active" ||
                        Boolean(lockState?.locked)
                      }
                      onClick={() => {
                        if (lockState?.locked) {
                          setError(
                            `This pocket is locked until ${formatUnlockDate(lockState.until)}.`,
                          );
                          return;
                        }
                        setAmountMode("withdraw");
                        setActionError(null);
                      }}
                      title={
                        lockState?.locked
                          ? `Locked until ${formatUnlockDate(lockState.until)}`
                          : "Withdraw"
                      }
                      type="button"
                      variant="outline"
                    >
                      {lockState?.locked ? (
                        <LockKeyhole className="mr-2 h-4 w-4" />
                      ) : (
                        <ArrowUpFromLine className="mr-2 h-4 w-4" />
                      )}
                      {lockState?.locked ? "Locked" : "Withdraw"}
                    </Button>
                    <Button
                      disabled={
                        !isWalletAuthenticated || pocket.status !== "active"
                      }
                      onClick={() => setEditing((v) => !v)}
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      disabled={
                        !isWalletAuthenticated || pocket.status !== "active"
                      }
                      onClick={() => void handleArchive()}
                      type="button"
                      variant="ghost"
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </Button>
                  </div>
                </div>

                <div className="mt-4">
                  <PocketLockPanel
                    disabled={!isWalletAuthenticated || pocket.status !== "active"}
                    isSaving={isActing}
                    onLock={(input) => void handleLock(input)}
                    pocket={pocket}
                  />
                </div>

                {spendSave?.enabled ? (
                  <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                    <span className="font-medium">Spend&Save active</span>
                    {" — "}
                    {Number(spendSave.percentage)}% of eligible spending goes
                    here.
                  </div>
                ) : null}

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="mt-1 text-sm font-medium">
                      {new Date(pocket.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">Last deposit</p>
                    <p className="mt-1 text-sm font-medium">
                      {stats?.lastDepositAt
                        ? new Date(stats.lastDepositAt).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">
                      Total deposits
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {formatMoney(stats?.totalDeposits ?? "0", currency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">
                      Total withdrawals
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {formatMoney(stats?.totalWithdrawals ?? "0", currency)}
                    </p>
                  </div>
                </div>

                {editing ? (
                  <div className="mt-6 space-y-3 rounded-xl border border-border p-4">
                    <Input
                      onChange={(e) => setEditName(e.target.value)}
                      value={editName}
                    />
                    <Input
                      onChange={(e) => setEditTarget(e.target.value)}
                      placeholder="Target amount (optional)"
                      value={editTarget}
                    />
                    <Input
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description"
                      value={editDescription}
                    />
                    {editTarget.trim() ? (
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          checked={editStopAtTarget}
                          className="mt-1"
                          onChange={(e) =>
                            setEditStopAtTarget(e.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          <span className="font-medium">
                            Stop saving when target is reached
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Uncheck to continue saving beyond your target.
                          </span>
                        </span>
                      </label>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        disabled={isActing}
                        onClick={() => void handleSaveEdit()}
                        type="button"
                      >
                        Save changes
                      </Button>
                      <Button
                        onClick={() => setEditing(false)}
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <PagedActivityBox
                empty="No transactions yet."
                items={transactions}
                title="Pocket activity"
                renderItem={(tx) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-sm"
                    key={tx.id}
                  >
                    <div>
                      <p className="font-medium">
                        {tx.type} · {formatMoney(tx.amount, tx.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.status} · {new Date(tx.created_at).toLocaleString()}
                      </p>
                    </div>
                    {tx.tx_hash ? (
                      <a
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        href={explorerTxUrl(tx.tx_hash)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Tx
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                )}
              />

              {amountMode ? (
                <AmountConfirmDialog
                  currency={pocket.currency}
                  error={actionError}
                  isSubmitting={
                    isActing ||
                    isWritePending ||
                    isConfirming ||
                    Boolean(pendingConfirm)
                  }
                  mode={amountMode}
                  onConfirm={(amount) => void handleAmountConfirm(amount)}
                  onOpenChange={(open) => {
                    if (!open) {
                      setAmountMode(null);
                      setActionError(null);
                    }
                  }}
                  open={Boolean(amountMode)}
                  pocketBalance={pocket.current_balance}
                  pocketName={pocket.name}
                  walletBalanceLabel={walletBalanceLabel}
                />
              ) : null}
            </>
          )}
        </div>
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
