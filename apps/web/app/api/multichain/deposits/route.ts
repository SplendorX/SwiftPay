import { type NextRequest } from "next/server";

import { multichainErrorResponse, multichainJson, requireOwner } from "@/lib/multichain/http";
import { multichainOverview } from "@/lib/multichain/view";

export const runtime = "nodejs";

/** Networks on offer, the owner's addresses, and deposits on their way to Arc. */
export async function GET(request: NextRequest) {
  try {
    const owner = await requireOwner(request.nextUrl.searchParams.get("ownerWallet"));
    return multichainJson(await multichainOverview(owner));
  } catch (error) {
    return multichainErrorResponse(error);
  }
}
