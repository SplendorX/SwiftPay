"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Loader2, ShieldCheck } from "lucide-react";
import type { Address, Hash } from "viem";
import { maxUint256 } from "viem";

import {
  readCircleLogin,
  type CircleLoginResult,
} from "@/lib/circle-session";
import {
  extractCircleTransactionId,
  extractCircleTxHash,
} from "@/lib/circle-tx";
import { AUTO_SAVE_AUTHORIZATION_TEXT } from "@/lib/earn/auto-save";
import { earnConfig } from "@/lib/earn/config";
import { erc20Abi } from "@/lib/contracts";
import {
  encodeErc20Approve,
  executeCircleContractCall,
} from "@/lib/save/circle-vault";
import { arcTestnetTokens } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { StyledSelect } from "@/components/ui/styled-select";

type AutoSaveRule = {
  enabled: boolean;
  min_idle_balance: string;
  save_amount: string;
  frequency: "daily" | "weekly" | "monthly";
  auto_sweep_enabled: boolean;
  auto_sweep_keep_balance: string;
  authorization_accepted: boolean;
  last_skip_reason: string | null;
  next_run_at: string | null;
};

type EditableFields = {
  enabled: boolean;
  min_idle_balance: string;
  save_amount: string;
  frequency: "daily" | "weekly" | "monthly";
  auto_sweep_enabled: boolean;
  auto_sweep_keep_balance: string;
  authorization_accepted: boolean;
};

type Execution = {
  id: string;
  amount: string;
  status: string;
  skip_reason: string | null;
  tx_hash: string | null;
  due_at: string | null;
  created_at: string;
};

const defaultEditable: EditableFields = {
  enabled: false,
  min_idle_balance: "100",
  save_amount: "50",
  frequency: "weekly",
  auto_sweep_enabled: false,
  auto_sweep_keep_balance: "500",
  authorization_accepted: false,
};

function toEditable(rule: Partial<AutoSaveRule> | null | undefined): EditableFields {
  return {
    enabled: Boolean(rule?.enabled),
    min_idle_balance: String(rule?.min_idle_balance ?? "100").trim(),
    save_amount: String(rule?.save_amount ?? "50").trim(),
    frequency: (rule?.frequency as EditableFields["frequency"]) ?? "weekly",
    auto_sweep_enabled: Boolean(rule?.auto_sweep_enabled),
    auto_sweep_keep_balance: String(
      rule?.auto_sweep_keep_balance ?? "500",
    ).trim(),
    authorization_accepted: Boolean(rule?.authorization_accepted),
  };
}

function snapshotKey(fields: EditableFields) {
  return JSON.stringify(fields);
}

export function AutoSavePanel() {
  const { address: wagmiAddress } = useAccount();
  const {
    address: platformAddress,
    circleWallet: platformCircleWallet,
    isBusinessWorkspace,
    isConnected,
    source,
  } = usePlatformWallet();
  const address = platformAddress ?? (isBusinessWorkspace ? undefined : wagmiAddress);
  const circleSdkRef = useRef<W3SSdk | null>(null);
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(null);
  const [circleSdkReady, setCircleSdkReady] = useState(false);
  const [rule, setRule] = useState<Partial<AutoSaveRule>>(defaultEditable);
  const [savedSnapshot, setSavedSnapshot] = useState(
    snapshotKey(defaultEditable),
  );
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [executorAddress, setExecutorAddress] = useState<string | null>(null);
  const [authorizationText, setAuthorizationText] = useState(
    AUTO_SAVE_AUTHORIZATION_TEXT,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hash | undefined>();
  /**
   * Approve is allowed when the form is dirty (recent edit) OR after a save
   * that included accepted authorization (so users can Save → Approve).
   * Cleared once approve is submitted for that opportunity.
   */
  const [approveEligible, setApproveEligible] = useState(false);

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

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
    source === "embedded" &&
      circleLogin &&
      platformCircleWallet?.id &&
      circleSdkReady,
  );

  const currentEditable = useMemo(() => toEditable(rule), [rule]);
  const isDirty = snapshotKey(currentEditable) !== savedSnapshot;
  const authorizationAccepted = Boolean(rule.authorization_accepted);

  const canSave =
    isDirty &&
    !saving &&
    !isPending &&
    !confirming &&
    // Cannot enable Auto-Save without accepting terms
    (!currentEditable.enabled || authorizationAccepted);

  const canApprove =
    Boolean(executorAddress) &&
    Boolean(earnConfig.vaultAddress) &&
    authorizationAccepted &&
    (isDirty || approveEligible) &&
    !isPending &&
    !confirming &&
    !saving;

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/earn/auto-save?ownerWallet=${encodeURIComponent(address)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to load Auto-Save.");
      }
      const nextRule = data.rule
        ? { ...defaultEditable, ...data.rule }
        : defaultEditable;
      setRule(nextRule);
      const snap = snapshotKey(toEditable(nextRule));
      setSavedSnapshot(snap);
      setApproveEligible(false);
      setExecutions(data.executions ?? []);
      setExecutorAddress(data.executorAddress ?? null);
      if (data.authorizationText) {
        setAuthorizationText(data.authorizationText);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!approveConfirmed || !txHash) return;
    setApproveEligible(false);
    setMessage("USDC allowance confirmed for Auto-Save.");
  }, [approveConfirmed, txHash]);

  function updateRule(patch: Partial<EditableFields>) {
    setMessage(null);
    setError(null);
    // Checking authorization (or any edit that makes form dirty) unlocks Approve
    if (patch.authorization_accepted === true) {
      setApproveEligible(true);
    }
    setRule((r) => ({ ...r, ...patch }));
  }

  async function save() {
    if (!address || !canSave) {
      if (!isDirty) {
        setError("No changes to save.");
      } else if (currentEditable.enabled && !authorizationAccepted) {
        setError(
          "Accept “I authorize SwiftPay under these terms” before enabling Auto-Save.",
        );
      }
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/earn/auto-save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerWallet: address,
          enabled: rule.enabled,
          minIdleBalance: rule.min_idle_balance,
          saveAmount: rule.save_amount,
          frequency: rule.frequency,
          autoSweepEnabled: rule.auto_sweep_enabled,
          autoSweepKeepBalance: rule.auto_sweep_keep_balance,
          authorizationAccepted: rule.authorization_accepted,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Save failed.");
      }
      const nextRule = data.rule ?? rule;
      setRule(nextRule);
      const snap = snapshotKey(toEditable(nextRule));
      setSavedSnapshot(snap);
      // After save with terms accepted, allow Approve without further edits
      setApproveEligible(Boolean(toEditable(nextRule).authorization_accepted));
      setMessage(data.message ?? "Settings saved.");
      setExecutorAddress(data.executorAddress ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function approveExecutor() {
    if (!canApprove) {
      if (!authorizationAccepted) {
        setError(
          "Check “I authorize SwiftPay under these terms” before approving USDC.",
        );
      } else if (!isDirty && !approveEligible) {
        setError(
          "Save settings or change a setting (with authorization checked) before approving.",
        );
      } else if (!executorAddress) {
        setError(
          "Auto-Save executor not deployed. Set NEXT_PUBLIC_EARN_AUTOSAVE_EXECUTOR_ADDRESS.",
        );
      }
      return;
    }
    setError(null);
    setMessage(null);
    try {
      let hash: Hash | undefined;
      if (isCircleMode) {
        const wallet = platformCircleWallet;
        if (!circleLogin || !wallet?.id || !circleSdkRef.current) {
          throw new Error("Circle wallet is not ready.");
        }
        const login = circleLogin;
        const sdk = circleSdkRef.current;
        const result = await executeCircleContractCall({
          callData: encodeErc20Approve(executorAddress as Address, maxUint256),
          contractAddress: arcTestnetTokens.USDC.address,
          executor: {
            login,
            walletId: wallet.id,
            executeChallenge: (challengeId) =>
              new Promise((resolve, reject) => {
                sdk.setAuthentication({
                  encryptionKey: login.encryptionKey,
                  userToken: login.userToken,
                });
                sdk.execute(challengeId, (error, challengeResult) => {
                  if (error) {
                    reject(
                      error instanceof Error
                        ? error
                        : new Error("Circle confirmation failed."),
                    );
                    return;
                  }
                  resolve({
                    transactionId: extractCircleTransactionId(challengeResult),
                    txHash: extractCircleTxHash(challengeResult),
                  });
                });
              }),
          },
          label: "auto-save approve",
          refId: `earn-autosave-approve-${Date.now()}`,
        });
        hash = result.txHash;
        if (!hash) {
          throw new Error(
            "Circle approval submitted. Waiting for the transaction hash. Try again shortly.",
          );
        }
      } else {
        hash = await writeContractAsync({
          address: arcTestnetTokens.USDC.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [executorAddress as Address, maxUint256],
        });
      }
      setTxHash(hash);
      setApproveEligible(false);
      setMessage("USDC allowance submitted for Auto-Save executor…");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed.");
    }
  }

  if (!isConnected) {
    return (
      <section className="earn-autosave-card">
        <h2>Auto-Save</h2>
        <p className="earn-footnote">Connect a wallet to configure Auto-Save.</p>
      </section>
    );
  }

  return (
    <section className="earn-autosave-card">
      <div className="earn-autosave-header">
        <h2>Auto-Save</h2>
        {rule.enabled ? (
          <span className="earn-pill">Enabled</span>
        ) : (
          <span className="earn-pill">Off</span>
        )}
      </div>
      <p className="earn-footnote">
        Automatically move idle USDC into Earn. Never drains below your minimum
        balance.
      </p>

      {loading ? (
        <p className="earn-footnote">
          <Loader2 className="inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="earn-autosave-form">
          <label className="earn-toggle-row">
            <input
              checked={Boolean(rule.enabled)}
              onChange={(e) => updateRule({ enabled: e.target.checked })}
              type="checkbox"
            />
            <span>Auto-Save ON/OFF</span>
          </label>

          <label className="earn-label">Minimum idle balance (USDC)</label>
          <input
            className="earn-input"
            onChange={(e) => updateRule({ min_idle_balance: e.target.value })}
            value={rule.min_idle_balance ?? "100"}
          />

          <label className="earn-label">Auto-save amount (USDC)</label>
          <input
            className="earn-input"
            onChange={(e) => updateRule({ save_amount: e.target.value })}
            value={rule.save_amount ?? "50"}
          />

          <label className="earn-label">Frequency</label>
          <StyledSelect
            ariaLabel="Auto-save frequency"
            onChange={(frequency) => updateRule({ frequency })}
            options={[
              { label: "Daily", value: "daily" },
              { label: "Weekly", value: "weekly" },
              { label: "Monthly", value: "monthly" },
            ]}
            value={rule.frequency ?? "weekly"}
          />

          <label className="earn-toggle-row">
            <input
              checked={Boolean(rule.auto_sweep_enabled)}
              onChange={(e) =>
                updateRule({ auto_sweep_enabled: e.target.checked })
              }
              type="checkbox"
            />
            <span>Auto-Sweep (sweep excess above keep balance)</span>
          </label>

          {rule.auto_sweep_enabled && (
            <>
              <label className="earn-label">Keep in spendable balance</label>
              <input
                className="earn-input"
                onChange={(e) =>
                  updateRule({ auto_sweep_keep_balance: e.target.value })
                }
                value={rule.auto_sweep_keep_balance ?? "500"}
              />
            </>
          )}

          <div className="earn-auth-box">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <div>
              <p className="earn-auth-title">Authorization required</p>
              <p className="earn-footnote">{authorizationText}</p>
              <label className="earn-toggle-row mt-2">
                <input
                  checked={authorizationAccepted}
                  onChange={(e) =>
                    updateRule({ authorization_accepted: e.target.checked })
                  }
                  type="checkbox"
                />
                <span>I authorize SwiftPay under these terms</span>
              </label>
              {!authorizationAccepted && (
                <p className="earn-footnote earn-auth-hint">
                  Required before you can enable Auto-Save or approve USDC.
                </p>
              )}
            </div>
          </div>

          <div className="earn-actions">
            <button
              className="earn-btn earn-btn-primary"
              disabled={!canSave}
              onClick={() => void save()}
              title={
                !isDirty
                  ? "No unsaved changes"
                  : currentEditable.enabled && !authorizationAccepted
                    ? "Accept authorization to enable Auto-Save"
                    : "Save Auto-Save settings"
              }
              type="button"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save settings"
              )}
            </button>
            {executorAddress && (
              <button
                className="earn-btn earn-btn-secondary"
                disabled={!canApprove}
                onClick={() => void approveExecutor()}
                title={
                  !authorizationAccepted
                    ? "Check authorization first"
                    : !isDirty && !approveEligible
                      ? "Save settings or edit a setting first"
                      : "Approve USDC for Auto-Save"
                }
                type="button"
              >
                {isPending || confirming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Approve USDC for Auto-Save"
                )}
              </button>
            )}
          </div>

          {!isDirty && !approveEligible && (
            <p className="earn-footnote">
              Save unlocks after you edit a setting. Approve requires the
              authorization checkbox, then a save or recent edit.
            </p>
          )}

          {rule.last_skip_reason && (
            <p
              className={cn(
                "earn-footnote",
                "text-amber-700 dark:text-amber-300",
              )}
            >
              Last cycle: {rule.last_skip_reason}
            </p>
          )}
          {rule.next_run_at && (
            <p className="earn-footnote">
              Next run: {new Date(rule.next_run_at).toLocaleString()}
            </p>
          )}
          {message && <p className="earn-footnote">{message}</p>}
          {error && <p className="earn-error">{error}</p>}

          {executions.length > 0 && (
            <div className="earn-exec-list">
              <p className="earn-label">Recent Auto-Save activity</p>
              <ul>
                {executions.slice(0, 5).map((ex) => (
                  <li key={ex.id}>
                    <span>
                      ${ex.amount} · {ex.status}
                    </span>
                    {ex.skip_reason && (
                      <span className="earn-footnote">. {ex.skip_reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
