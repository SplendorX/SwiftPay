import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import {
  assertRecurringAccess,
  getSessionOwnerWallet,
} from "@/lib/recurring-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const beneficiariesTable =
  process.env.SUPABASE_BENEFICIARIES_TABLE ?? "beneficiaries";

type SaveBeneficiaryBody = {
  beneficiaryWallet?: unknown;
  circleSocialUuid?: unknown;
  name?: unknown;
  ownerWallet?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function normalizeWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return getAddress(value);
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim().replace(/\s+/g, " ");

  if (!name || name.length > 80) {
    return null;
  }

  return name;
}

function readSupabaseError(error: { message?: string } | null) {
  const message = error?.message ?? "";

  if (message.toLowerCase().includes("permission denied")) {
    return "Supabase rejected access to the beneficiaries table. Run supabase/beneficiaries.sql in your Supabase SQL editor.";
  }

  if (message.toLowerCase().includes("does not exist")) {
    return "Create the beneficiaries table with supabase/beneficiaries.sql before saving recipients.";
  }

  if (
    message.toLowerCase().includes("bigint") ||
    message.toLowerCase().includes("out of range")
  ) {
    return "The beneficiaries table has wallet columns with the wrong type. Run the latest supabase/beneficiaries.sql so owner_wallet and beneficiary_wallet are text columns.";
  }

  return message || "Supabase could not save this beneficiary.";
}

async function resolveOwnerWallet(
  request: NextRequest,
  body?: SaveBeneficiaryBody,
) {
  const requested = normalizeWallet(
    body?.ownerWallet ?? request.nextUrl.searchParams.get("ownerWallet"),
  );
  const circleSocialUuid =
    (typeof body?.circleSocialUuid === "string"
      ? body.circleSocialUuid
      : null) ??
    request.nextUrl.searchParams.get("circleSocialUuid") ??
    undefined;
  const ownerWallet = requested ?? (await getSessionOwnerWallet());

  if (!ownerWallet) {
    return null;
  }

  const allowed = await assertRecurringAccess({
    circleSocialUuid,
    ownerWallet,
  });

  return allowed ? ownerWallet.toLowerCase() : null;
}

export async function GET(request: NextRequest) {
  const ownerWallet = await resolveOwnerWallet(request);

  if (!ownerWallet) {
    return jsonError("Sign in with your wallet to load beneficiaries.", 401);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(beneficiariesTable)
      .select("owner_wallet,name,beneficiary_wallet")
      .eq("owner_wallet", ownerWallet.toLowerCase())
      .order("name", { ascending: true })
      .limit(100);

    if (error) {
      return jsonError(readSupabaseError(error), 500);
    }

    return NextResponse.json({ beneficiaries: data ?? [] });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Beneficiaries could not be loaded.";

    return jsonError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  let body: SaveBeneficiaryBody;

  try {
    body = (await request.json()) as SaveBeneficiaryBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = await resolveOwnerWallet(request, body);
  const beneficiaryWallet = normalizeWallet(body.beneficiaryWallet);
  const name = normalizeName(body.name);

  if (!ownerWallet) {
    return jsonError("Sign in with your wallet before saving beneficiaries.", 401);
  }

  if (!beneficiaryWallet) {
    return jsonError("A valid beneficiary wallet is required.", 400);
  }

  if (!name) {
    return jsonError("Beneficiary name is required.", 400);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const owner_wallet = ownerWallet.toLowerCase();
    const beneficiary_wallet = beneficiaryWallet.toLowerCase();
    const beneficiary = {
      beneficiary_wallet,
      name,
      owner_wallet,
    };
    const existing = await supabase
      .from(beneficiariesTable)
      .select("owner_wallet,beneficiary_wallet")
      .eq("owner_wallet", owner_wallet)
      .eq("beneficiary_wallet", beneficiary_wallet)
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      return jsonError(readSupabaseError(existing.error), 500);
    }

    const mutation = existing.data
      ? await supabase
          .from(beneficiariesTable)
          .update({ name })
          .eq("owner_wallet", owner_wallet)
          .eq("beneficiary_wallet", beneficiary_wallet)
      : await supabase.from(beneficiariesTable).insert(beneficiary);

    if (mutation.error) {
      return jsonError(readSupabaseError(mutation.error), 500);
    }

    return NextResponse.json({ beneficiary });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Beneficiary could not be saved.";

    return jsonError(message, 500);
  }
}

type UpdateBeneficiaryBody = SaveBeneficiaryBody & {
  /** The contact's wallet after the edit; omit to keep it. */
  newBeneficiaryWallet?: unknown;
};

/** Rename a contact and/or point it at a different wallet. */
export async function PATCH(request: NextRequest) {
  let body: UpdateBeneficiaryBody;

  try {
    body = (await request.json()) as UpdateBeneficiaryBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = await resolveOwnerWallet(request, body);
  const currentWallet = normalizeWallet(body.beneficiaryWallet);
  const nextWallet =
    body.newBeneficiaryWallet === undefined
      ? currentWallet
      : normalizeWallet(body.newBeneficiaryWallet);
  const name = normalizeName(body.name);

  if (!ownerWallet) {
    return jsonError("Sign in with your wallet before editing contacts.", 401);
  }
  if (!currentWallet || !nextWallet) {
    return jsonError("A valid contact wallet is required.", 400);
  }
  if (!name) {
    return jsonError("Contact name is required.", 400);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const owner_wallet = ownerWallet.toLowerCase();
    const beneficiary_wallet = nextWallet.toLowerCase();
    const walletChanged = beneficiary_wallet !== currentWallet.toLowerCase();

    // One contact per wallet: moving onto a wallet already saved would
    // silently merge two contacts.
    if (walletChanged) {
      const taken = await supabase
        .from(beneficiariesTable)
        .select("name")
        .eq("owner_wallet", owner_wallet)
        .eq("beneficiary_wallet", beneficiary_wallet)
        .limit(1)
        .maybeSingle<{ name: string }>();
      if (taken.error) {
        return jsonError(readSupabaseError(taken.error), 500);
      }
      if (taken.data) {
        return jsonError(`That wallet is already saved as ${taken.data.name}.`, 409);
      }
    }

    const { data, error } = await supabase
      .from(beneficiariesTable)
      .update({ beneficiary_wallet, name })
      .eq("owner_wallet", owner_wallet)
      .eq("beneficiary_wallet", currentWallet.toLowerCase())
      .select("owner_wallet,name,beneficiary_wallet");

    if (error) {
      return jsonError(readSupabaseError(error), 500);
    }
    if (!data || data.length === 0) {
      return jsonError("That contact no longer exists.", 404);
    }

    return NextResponse.json({ beneficiary: data[0] });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Contact could not be updated.",
      500,
    );
  }
}

/** Remove a contact. */
export async function DELETE(request: NextRequest) {
  const ownerWallet = await resolveOwnerWallet(request);
  const beneficiaryWallet = normalizeWallet(
    request.nextUrl.searchParams.get("beneficiaryWallet"),
  );

  if (!ownerWallet) {
    return jsonError("Sign in with your wallet before deleting contacts.", 401);
  }
  if (!beneficiaryWallet) {
    return jsonError("A valid contact wallet is required.", 400);
  }

  try {
    const { error } = await createSupabaseAdminClient()
      .from(beneficiariesTable)
      .delete()
      .eq("owner_wallet", ownerWallet.toLowerCase())
      .eq("beneficiary_wallet", beneficiaryWallet.toLowerCase());

    if (error) {
      return jsonError(
        /permission denied/i.test(error.message ?? "")
          ? "Deleting contacts needs a database update: run packages/database/supabase/beneficiaries-delete.sql."
          : readSupabaseError(error),
        500,
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Contact could not be deleted.",
      500,
    );
  }
}
