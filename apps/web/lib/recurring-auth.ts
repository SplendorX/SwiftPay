import { cookies } from "next/headers";
import { getAddress, isAddress } from "viem";

import { createSupabaseAdminClient } from "@/lib/supabase-server";
import {
  readWalletToken,
  walletSessionCookieName,
} from "@/lib/wallet-session";

const profilesTable = process.env.SUPABASE_PROFILES_TABLE ?? "profiles";

export async function getSessionOwnerWallet() {
  const cookieStore = await cookies();
  const session = readWalletToken(
    cookieStore.get(walletSessionCookieName)?.value,
    "session",
  );

  return session?.ownerWallet?.toLowerCase() ?? null;
}

export function normalizeOwnerWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return getAddress(value).toLowerCase();
}

function normalizeCircleSocialUuid(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const socialUuid = value.trim();
  return socialUuid || null;
}

/**
 * Authorize an owner wallet for sensitive APIs (notifications, savings, recurring).
 * Accepts either:
 * 1) Signed wallet session cookie for that address, or
 * 2) Circle Google social UUID bound to that wallet in profiles.
 */
export async function assertRecurringAccess(input: {
  circleSocialUuid?: unknown;
  ownerWallet: string;
}) {
  const owner = input.ownerWallet.toLowerCase();
  const sessionOwnerWallet = await getSessionOwnerWallet();

  if (sessionOwnerWallet && sessionOwnerWallet === owner) {
    return true;
  }

  const circleSocialUuid = normalizeCircleSocialUuid(input.circleSocialUuid);

  if (!circleSocialUuid) {
    return false;
  }

  try {
    const supabase = createSupabaseAdminClient();

    // Primary: profile row keyed by wallet address.
    const byWallet = await supabase
      .from(profilesTable)
      .select("wallet_address,circle_social_uuid")
      .eq("wallet_address", owner)
      .maybeSingle();

    if (
      !byWallet.error &&
      byWallet.data?.circle_social_uuid &&
      byWallet.data.circle_social_uuid === circleSocialUuid
    ) {
      return true;
    }

    // Fallback: profile row keyed by social UUID (wallet may have been updated).
    const bySocial = await supabase
      .from(profilesTable)
      .select("wallet_address,circle_social_uuid")
      .eq("circle_social_uuid", circleSocialUuid)
      .maybeSingle();

    if (
      !bySocial.error &&
      bySocial.data?.wallet_address &&
      bySocial.data.wallet_address.toLowerCase() === owner
    ) {
      return true;
    }
  } catch (error) {
    console.warn(
      "[assertRecurringAccess]",
      error instanceof Error ? error.message : "profile lookup failed",
    );
  }

  return false;
}
