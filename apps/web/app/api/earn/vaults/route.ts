import { NextResponse } from "next/server";

import { earnErrorResponse, listEarnVaults } from "@/server/earn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await listEarnVaults();
    return NextResponse.json(result);
  } catch (error) {
    return earnErrorResponse(error);
  }
}
