import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { earnConfig } from "@/lib/earn/config";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const depositsTable = process.env.SUPABASE_EARN_DEPOSITS_TABLE ?? "earn_deposits";
const withdrawalsTable =
  process.env.SUPABASE_EARN_WITHDRAWALS_TABLE ?? "earn_withdrawals";

function normalizeWallet(value: string | null) {
  if (!value || !isAddress(value)) return null;
  return getAddress(value).toLowerCase();
}

export async function GET(request: NextRequest) {
  const wallet = normalizeWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit") || 50),
    100,
  );

  if (!wallet) {
    return NextResponse.json({ message: "ownerWallet is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const vault = earnConfig.vaultAddress?.toLowerCase();

    let depositsQuery = supabase
      .from(depositsTable)
      .select("*")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false })
      .limit(limit);

    let withdrawalsQuery = supabase
      .from(withdrawalsTable)
      .select("*")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (vault) {
      depositsQuery = depositsQuery.eq("vault_address", vault);
      withdrawalsQuery = withdrawalsQuery.eq("vault_address", vault);
    }

    const [deposits, withdrawals] = await Promise.all([
      depositsQuery,
      withdrawalsQuery,
    ]);

    if (deposits.error || withdrawals.error) {
      return NextResponse.json(
        {
          message:
            deposits.error?.message ||
            withdrawals.error?.message ||
            "History unavailable.",
          hint: "Run packages/database/supabase/earn-vault.sql and /api/cron/earn to index events.",
        },
        { status: 500 },
      );
    }

    const events = [
      ...(deposits.data ?? []).map((row) => ({
        ...row,
        type: "deposit" as const,
      })),
      ...(withdrawals.data ?? []).map((row) => ({
        ...row,
        type: "withdrawal" as const,
      })),
    ].sort((a, b) => {
      const ta = new Date(a.timestamp || a.created_at).getTime();
      const tb = new Date(b.timestamp || b.created_at).getTime();
      return tb - ta;
    });

    return NextResponse.json({
      events: events.slice(0, limit),
      buildingHistory: events.length === 0,
      message:
        events.length === 0
          ? "Building your earnings history…"
          : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "History unavailable.",
        buildingHistory: true,
      },
      { status: 500 },
    );
  }
}
