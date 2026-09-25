"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AutoDepositFrequency,
  AutoDepositMode,
  AutoDepositRule,
} from "@/lib/earn/auto-deposit";

/**
 * Client state for Earn auto-deposit.
 *
 * Owns the rule, the premium entitlement, and — for SWEEP rules — whether a
 * deposit is due right now. The actual deposit is not run here: it goes
 * through the same signed `browserDeposit` path as a manual one, so automation
 * never gains an authority the owner does not already grant per transaction.
 */

export type AutoDepositState = {
  error: string | null;
  executorAddress: string | null;
  /** End of the paid term, or null if never bought. */
  expiresAt: string | null;
  /** True when a term exists but has lapsed — renew rather than unlock. */
  expired: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  removeRule: () => Promise<void>;
  rule: AutoDepositRule | null;
  saveRule: (input: SaveRuleInput) => Promise<void>;
  saving: boolean;
  unlock: () => Promise<void>;
  unlockCost: number;
  unlocked: boolean;
};

export type SaveRuleInput = {
  amountUsdc: number;
  frequency: AutoDepositFrequency;
  minBalanceFloor: number;
  mode: AutoDepositMode;
  vaultAddress: string;
};

type RulePayload = {
  executorAddress: string | null;
  expiresAt: string | null;
  hadEntitlement: boolean;
  rule: AutoDepositRule | null;
  unlockCost: number;
  unlocked: boolean;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.message || "Auto-deposit request failed.");
  }

  return payload as T;
}

export function useAutoDeposit(input: {
  circleSocialUuid?: string;
  walletAddress?: string | null;
}): AutoDepositState {
  const { circleSocialUuid, walletAddress } = input;
  const [rule, setRule] = useState<AutoDepositRule | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockCost, setUnlockCost] = useState(500);
  const [executorAddress, setExecutorAddress] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [hadEntitlement, setHadEntitlement] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (walletAddress) params.set("wallet", walletAddress);
    if (circleSocialUuid) params.set("circleSocialUuid", circleSocialUuid);
    return params.toString();
  }, [circleSocialUuid, walletAddress]);

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setRule(null);
      setUnlocked(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await readJson<RulePayload>(
        await fetch(`/api/earn/auto-deposit?${query}`, { cache: "no-store" }),
      );
      setRule(payload.rule);
      setUnlocked(payload.unlocked);
      setUnlockCost(payload.unlockCost);
      setExecutorAddress(payload.executorAddress);
      setExpiresAt(payload.expiresAt);
      setHadEntitlement(payload.hadEntitlement);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the rule.");
    } finally {
      setLoading(false);
    }
  }, [query, walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlock = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await readJson(
        await fetch("/api/swiftpoints/entitlements", {
          body: JSON.stringify({
            circleSocialUuid,
            feature: "EARN_AUTO_DEPOSIT",
            // Pressing this while access is still running is a renewal, and
            // has to say so or the server treats it as already unlocked and
            // extends nothing.
            renew: unlocked,
            walletAddress,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not unlock.");
      throw cause;
    } finally {
      setSaving(false);
    }
  }, [circleSocialUuid, refresh, unlocked, walletAddress]);

  const saveRule = useCallback(
    async (next: SaveRuleInput) => {
      setSaving(true);
      setError(null);
      try {
        await readJson(
          await fetch("/api/earn/auto-deposit", {
            body: JSON.stringify({ ...next, circleSocialUuid, walletAddress }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }),
        );
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the rule.");
        throw cause;
      } finally {
        setSaving(false);
      }
    },
    [circleSocialUuid, refresh, walletAddress],
  );

  const removeRule = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await readJson(
        await fetch(`/api/earn/auto-deposit?${query}`, { method: "DELETE" }),
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the rule.");
    } finally {
      setSaving(false);
    }
  }, [query, refresh]);

  return {
    error,
    executorAddress,
    expired: hadEntitlement && !unlocked,
    expiresAt,
    loading,
    refresh,
    removeRule,
    rule,
    saveRule,
    saving,
    unlock,
    unlockCost,
    unlocked,
  };
}

/** Marks a completed sweep so the rule advances to its next period. */
export async function markSweepRan(input: {
  circleSocialUuid?: string;
  walletAddress: string;
}) {
  await fetch("/api/earn/auto-deposit", {
    body: JSON.stringify({ ...input, markRan: true }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

/**
 * Whether a SWEEP rule should be offered right now.
 *
 * Deliberately conservative: the balance is the live on-chain figure, and the
 * floor must survive the deposit, so a rule can never be offered when taking
 * it would breach the reserve its owner set.
 */
export function sweepReadiness(input: {
  balanceUsdc: number | undefined;
  rule: AutoDepositRule | null;
}): { ready: boolean; reason: string | null } {
  const { balanceUsdc, rule } = input;

  if (!rule || !rule.enabled || rule.mode !== "SWEEP") {
    return { ready: false, reason: null };
  }

  if (new Date(rule.next_run_at).getTime() > Date.now()) {
    return { ready: false, reason: null };
  }

  if (balanceUsdc === undefined) {
    return { ready: false, reason: null };
  }

  if (balanceUsdc - rule.amount_usdc < rule.min_balance_floor) {
    return {
      ready: false,
      reason: `Waiting for your balance to cover ${rule.amount_usdc} USDC while keeping ${rule.min_balance_floor} liquid.`,
    };
  }

  return { ready: true, reason: null };
}
