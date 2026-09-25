// Server-only: reads profiles with the service role.
import { getPublicDirectoryProfile } from "@/lib/business/service";
import type { PublicProfile } from "@/lib/business/types";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

const profilesTable = process.env.SUPABASE_PROFILES_TABLE ?? "profiles";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Everything a public profile page shows. Businesses (workspace or upgraded
 * account) publish category, website and how to reach them. A person's page
 * adds only their country and join date: their contact email and phone are
 * private and never read here.
 */
export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  const hit = await getPublicDirectoryProfile(username);
  if (!hit) return null;

  const db = createSupabaseAdminClient();

  // A workspace business: its public details live on its business profile.
  // (A person can also have a personal workspace; that is not a business.)
  if (hit.kind === "business" && hit.workspaceId) {
    const { data } = await db
      .from("business_profiles")
      .select("category,website,contact_email,contact_phone,country,created_at")
      .eq("workspace_id", hit.workspaceId)
      .maybeSingle();
    const row = (data ?? {}) as Row;
    return {
      ...hit,
      category: text(row.category),
      contactEmail: text(row.contact_email),
      country: text(row.country),
      memberSince: text(row.created_at),
      phone: text(row.contact_phone),
      website: text(row.website),
    };
  }

  const { data: person } = await db
    .from(profilesTable)
    .select("wallet_address,account_type,created_at")
    .ilike("username", hit.username)
    .limit(1)
    .maybeSingle();
  const personRow = (person ?? null) as Row | null;
  const wallet = text(personRow?.wallet_address);
  const memberSince = text(personRow?.created_at);

  // A personal account upgraded to Business: its account business profile.
  if (hit.kind === "business" && wallet) {
    const { data } = await db
      .from("business_account_profiles")
      .select("category,website,contact_email,phone,country,created_at")
      .eq("wallet_address", wallet)
      .maybeSingle();
    const row = (data ?? {}) as Row;
    return {
      ...hit,
      category: text(row.category),
      contactEmail: text(row.contact_email),
      country: text(row.country),
      memberSince: memberSince ?? text(row.created_at),
      phone: text(row.phone),
      website: text(row.website),
    };
  }

  // A person: country only (the column arrives with a migration, so a
  // missing column just means no country yet).
  let country: string | null = null;
  if (wallet) {
    const { data, error } = await db
      .from(profilesTable)
      .select("country")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (!error) country = text((data as Row | null)?.country);
  }
  return { ...hit, country, memberSince };
}
