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

export async function assertRecurringAccess(input: {
  circleSocialUuid?: unknown;
  ownerWallet: string;
}) {
  const sessionOwnerWallet = await getSessionOwnerWallet();

  if (
    sessionOwnerWallet &&
    sessionOwnerWallet === input.ownerWallet.toLowerCase()
  ) {
    return true;
  }

  const circleSocialUuid = normalizeCircleSocialUuid(input.circleSocialUuid);

  if (!circleSocialUuid) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  const existing = await supabase
    .from(profilesTable)
    .select("wallet_address,circle_social_uuid")
    .eq("wallet_address", input.ownerWallet.toLowerCase())
    .maybeSingle();

  if (existing.error || !existing.data) {
    return false;
  }

  return existing.data.circle_social_uuid === circleSocialUuid;
}