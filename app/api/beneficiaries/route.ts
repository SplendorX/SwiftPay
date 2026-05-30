import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { createSupabaseAdminClient } from "@/lib/supabase-server";
import {
  readWalletToken,
  walletSessionCookieName,
} from "@/lib/wallet-session";

export const runtime = "nodejs";

const beneficiariesTable =
  process.env.SUPABASE_BENEFICIARIES_TABLE ?? "beneficiaries";

type SaveBeneficiaryBody = {
  beneficiaryWallet?: unknown;
  name?: unknown;
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

async function getSessionOwnerWallet() {
  const cookieStore = await cookies();
  const session = readWalletToken(
    cookieStore.get(walletSessionCookieName)?.value,
    "session",
  );

  return session?.ownerWallet ?? null;
}

export async function GET() {
  const ownerWallet = await getSessionOwnerWallet();

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

  const ownerWallet = await getSessionOwnerWallet();
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
