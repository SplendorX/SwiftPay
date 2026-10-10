// Server-only. Whether a username is free to claim.
import { accountDb, accountTables, readAccountDbError } from "@/lib/account/db";
import { businessTables } from "@/lib/business/db";
import { normalizeUsername, validateUsername } from "@/lib/profile-utils";

export type UsernameAvailability =
  | { available: true; username: string }
  | { available: false; reason: "invalid" | "taken"; message: string; username: string };

/**
 * A username must be free among people (profiles) and among business and
 * individual payment identities. One already held by `ownWallet` counts as
 * free, so a user's current name never shows as taken to themselves.
 */
export async function checkUsernameAvailability(
  value: string,
  ownWallet?: string | null,
): Promise<UsernameAvailability> {
  const username = normalizeUsername(value);
  const invalid = validateUsername(username);
  if (invalid) return { available: false, message: invalid, reason: "invalid", username };

  const own = ownWallet?.trim().toLowerCase() || null;
  const supabase = accountDb();
  const [profile, identity] = await Promise.all([
    supabase
      .from(accountTables.profiles)
      .select("wallet_address")
      .ilike("username", username)
      .limit(1)
      .maybeSingle(),
    supabase
      .from(businessTables.identities)
      .select("destination_wallet,profile_wallet")
      .eq("username", username)
      .maybeSingle(),
  ]);
  if (profile.error) throw new Error(readAccountDbError(profile.error, "Could not check that username."));
  if (identity.error) throw new Error(readAccountDbError(identity.error, "Could not check that username."));

  const profileWallet = (profile.data as { wallet_address: string } | null)?.wallet_address?.toLowerCase();
  const identityRow = identity.data as { destination_wallet: string | null; profile_wallet: string | null } | null;
  const identityWallets = [identityRow?.profile_wallet, identityRow?.destination_wallet]
    .filter((wallet): wallet is string => Boolean(wallet))
    .map((wallet) => wallet.toLowerCase());

  const takenByProfile = Boolean(profileWallet) && profileWallet !== own;
  const takenByIdentity = Boolean(identityRow) && !(own && identityWallets.includes(own));
  if (takenByProfile || takenByIdentity) {
    return { available: false, message: "That username is taken. Try another.", reason: "taken", username };
  }
  return { available: true, username };
}
