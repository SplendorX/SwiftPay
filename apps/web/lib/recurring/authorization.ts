import type { Address } from "viem";

import { createRecurringPublicClient } from "@/lib/recurring/circle-adapter";
import { erc20Abi, swiftRecurepayExecutorAddress } from "@/lib/contracts";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import {
  withScheduleDefaults,
  type RecurringAuthorizationStatus,
  type RecurringScheduleRecord,
} from "@/lib/recurring-utils";
import { arcTestnetTokens } from "@/lib/tokens";

const schedulesTable =
  process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";

export function computeDefaultTotalLimitUnits(schedule: RecurringScheduleRecord) {
  const amount = BigInt(schedule.amount_units);
  if (schedule.max_runs && schedule.max_runs > 0) {
    return (amount * BigInt(schedule.max_runs)).toString();
  }
  return null;
}

export async function verifyExecutorAllowance(input: {
  ownerWallet: string;
  requiredUnits: bigint;
  tokenSymbol: RecurringScheduleRecord["token_symbol"];
}) {
  if (!swiftRecurepayExecutorAddress) {
    return {
      allowance: 0n,
      error: "SwiftRecurepay executor is not configured.",
      ok: false as const,
    };
  }

  const publicClient = createRecurringPublicClient();
  const tokenInfo = arcTestnetTokens[input.tokenSymbol];
  const allowance = await publicClient.readContract({
    abi: erc20Abi,
    address: tokenInfo.address,
    args: [input.ownerWallet as Address, swiftRecurepayExecutorAddress as Address],
    functionName: "allowance",
  });

  if (allowance < input.requiredUnits) {
    return {
      allowance,
      error:
        "Approve the SwiftRecurepay executor for at least one payment plus the 1% platform fee.",
      ok: false as const,
    };
  }

  return { allowance, ok: true as const };
}

export async function authorizeRecurringSchedule(input: {
  authorizationTxHash?: string | null;
  expiresAt?: string | null;
  maxPaymentAmountUnits?: string | null;
  ownerWallet: string;
  schedule: RecurringScheduleRecord;
  totalLimitUnits?: string | null;
}) {
  const schedule = withScheduleDefaults(input.schedule);
  const maxUnits = BigInt(
    input.maxPaymentAmountUnits ?? schedule.amount_units,
  );
  const required = maxUnits + (maxUnits * 100n) / 10_000n;
  const verified = await verifyExecutorAllowance({
    ownerWallet: input.ownerWallet,
    requiredUnits: required,
    tokenSymbol: schedule.token_symbol,
  });

  if (!verified.ok) {
    return { error: verified.error };
  }

  const now = new Date().toISOString();
  const totalLimitUnits =
    input.totalLimitUnits ??
    schedule.total_limit_units ??
    computeDefaultTotalLimitUnits(schedule);

  const supabase = createSupabaseAdminClient();
  const mutation = await supabase
    .from(schedulesTable)
    .update({
      authorization_expires_at: input.expiresAt ?? schedule.ends_at,
      authorization_status: "AUTHORIZED" satisfies RecurringAuthorizationStatus,
      authorization_tx_hash: input.authorizationTxHash ?? null,
      authorized_at: now,
      authorized_recipient: schedule.beneficiary_wallet.toLowerCase(),
      authorized_token: schedule.token_symbol,
      autopay_enabled: true,
      max_payment_amount: schedule.amount,
      max_payment_amount_units: maxUnits.toString(),
      total_limit_units: totalLimitUnits,
      updated_at: now,
    })
    .eq("id", schedule.id)
    .eq("owner_wallet", input.ownerWallet.toLowerCase())
    .select("*")
    .single();

  if (mutation.error || !mutation.data) {
    return {
      error: mutation.error?.message ?? "Could not store Autopay authorization.",
    };
  }

  return { schedule: withScheduleDefaults(mutation.data as RecurringScheduleRecord) };
}

export async function revokeRecurringAuthorization(input: {
  ownerWallet: string;
  scheduleId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const mutation = await supabase
    .from(schedulesTable)
    .update({
      authorization_status: "REVOKED" satisfies RecurringAuthorizationStatus,
      autopay_enabled: false,
      updated_at: now,
    })
    .eq("id", input.scheduleId)
    .eq("owner_wallet", input.ownerWallet.toLowerCase())
    .select("*")
    .single();

  if (mutation.error || !mutation.data) {
    return { error: mutation.error?.message ?? "Could not revoke Autopay." };
  }

  return { schedule: withScheduleDefaults(mutation.data as RecurringScheduleRecord) };
}

export function authorizationInvalidatedByUpdate(
  current: RecurringScheduleRecord,
  updates: {
    amountUnits?: string;
    tokenSymbol?: string;
  },
) {
  if (current.authorization_status !== "AUTHORIZED") {
    return false;
  }
  if (updates.amountUnits && updates.amountUnits !== current.amount_units) {
    return true;
  }
  if (
    updates.tokenSymbol &&
    updates.tokenSymbol.toUpperCase() !== current.token_symbol.toUpperCase()
  ) {
    return true;
  }
  return false;
}
