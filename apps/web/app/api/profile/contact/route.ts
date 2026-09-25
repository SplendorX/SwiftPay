import { NextResponse, type NextRequest } from "next/server";

import { assertRecurringAccess, normalizeOwnerWallet } from "@/lib/recurring-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const profilesTable = process.env.SUPABASE_PROFILES_TABLE ?? "profiles";

/**
 * The signed-in owner's personal contact details, for Settings. Kept off the
 * public GET /api/profile: contact email and phone are private.
 * `ready: false` means profiles-personal-contact.sql has not been run yet.
 */
export async function GET(request: NextRequest) {
  const ownerWallet = normalizeOwnerWallet(request.nextUrl.searchParams.get("wallet"));
  if (!ownerWallet) {
    return NextResponse.json({ message: "A valid wallet address is required." }, { status: 400 });
  }

  const allowed = await assertRecurringAccess({
    circleSocialUuid: request.nextUrl.searchParams.get("circleSocialUuid") ?? undefined,
    ownerWallet,
  });
  if (!allowed) {
    return NextResponse.json({ message: "Authorize this wallet first." }, { status: 401 });
  }

  const { data, error } = await createSupabaseAdminClient()
    .from(profilesTable)
    .select("contact_email,country,phone")
    .eq("wallet_address", ownerWallet)
    .maybeSingle();

  if (error) {
    if (/contact_email|country|phone|column/i.test(error.message ?? "")) {
      return NextResponse.json({ contactEmail: null, country: null, phone: null, ready: false });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const row = data as { contact_email: string | null; country: string | null; phone: string | null } | null;
  return NextResponse.json({
    contactEmail: row?.contact_email ?? null,
    country: row?.country ?? null,
    phone: row?.phone ?? null,
    ready: true,
  });
}
