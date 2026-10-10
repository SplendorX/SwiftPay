import { type NextRequest } from "next/server";

import { multichainErrorResponse, multichainJson, requireOwner, requireRateLimit } from "@/lib/multichain/http";
import { readFeeMode } from "@/lib/multichain/rules";
import { quoteFor } from "@/lib/multichain/send-service";
import { assertMultichainOpen, enabledChainForKey } from "@/lib/multichain/service";

export const runtime = "nodejs";

/** What a send to another network costs and what arrives, from Circle's live fees. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const owner = await requireOwner(params.get("ownerWallet"));
    assertMultichainOpen(owner);
    await requireRateLimit(`multichain-quote:${owner}`, 120, 60);
    const chain = enabledChainForKey(params.get("network"));
    return multichainJson(await quoteFor(chain, params.get("amount") ?? "", readFeeMode(params.get("feeMode"))));
  } catch (error) {
    return multichainErrorResponse(error);
  }
}
