import { normalizeUsername, validateUsername } from "@/lib/profile-utils";
import { circleErrors } from "@/lib/swift-circle/errors";
import { circleDb, circleTables, readCircleDbError } from "@/lib/swift-circle/db";

export type CircleProfile = {
  wallet_address: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function parseInviteUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^@/, "");
  const username = normalizeUsername(raw);
  if (validateUsername(username)) return null;
  return username;
}

export async function resolveProfileByUsername(username: string) {
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.profiles)
    .select("wallet_address,username,display_name,avatar_url")
    .ilike("username", username)
    .maybeSingle();
  if (error) {
    throw new Error(readCircleDbError(error, "Could not resolve username."));
  }
  if (!data?.wallet_address) {
    throw circleErrors.notFound("User");
  }
  return {
    wallet_address: String(data.wallet_address).toLowerCase(),
    username: String(data.username),
    display_name: (data.display_name as string | null) ?? null,
    avatar_url: (data.avatar_url as string | null) ?? null,
  } satisfies CircleProfile;
}

export async function loadProfilesByWallets(wallets: string[]) {
  const unique = [...new Set(wallets.map((wallet) => wallet.toLowerCase()))];
  if (unique.length === 0) return new Map<string, CircleProfile>();
  const supabase = circleDb();
  const { data, error } = await supabase
    .from(circleTables.profiles)
    .select("wallet_address,username,display_name,avatar_url")
    .in("wallet_address", unique);
  if (error) {
    throw new Error(readCircleDbError(error, "Could not load profiles."));
  }
  const map = new Map<string, CircleProfile>();
  for (const row of data ?? []) {
    const wallet = String(row.wallet_address).toLowerCase();
    map.set(wallet, {
      wallet_address: wallet,
      username: String(row.username ?? ""),
      display_name: (row.display_name as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
    });
  }
  return map;
}

export function decorateWithProfile<T extends { user_wallet?: string | null }>(
  row: T,
  field: keyof T,
  profiles: Map<string, CircleProfile>,
  prefix: string,
) {
  const wallet = String(row[field] ?? "").toLowerCase();
  const profile = profiles.get(wallet);
  return {
    ...row,
    [`${prefix}_username`]: profile?.username ?? null,
    [`${prefix}_display_name`]: profile?.display_name ?? null,
    [`${prefix}_avatar_url`]: profile?.avatar_url ?? null,
  };
}
