import { type NextRequest } from "next/server";

import { enabledMultichainChains } from "@/lib/multichain/flag";
import { multichainErrorResponse, multichainJson, requireOwner, requireRateLimit } from "@/lib/multichain/http";
import { networkFees } from "@/lib/multichain/send-service";
import { assertMultichainOpen } from "@/lib/multichain/service";

export const runtime = "nodejs";

/** Every network's send fee, from Circle's live fees, for the network picker. */
export async function GET(request: NextRequest) {
  try {
    const owner = await requireOwner(request.nextUrl.searchParams.get("ownerWallet"));
    assertMultichainOpen(owner);
    await requireRateLimit(`multichain-fees:${owner}`, 30, 60);
    return multichainJson({ fees: await networkFees(enabledMultichainChains()) });
  } catch (error) {
    return multichainErrorResponse(error);
  }
}
