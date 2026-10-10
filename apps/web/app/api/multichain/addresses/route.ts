import { type NextRequest } from "next/server";

import { readJsonRecord } from "@/lib/http";
import {
  multichainErrorResponse,
  multichainJson,
  requireOwner,
  requireRateLimit,
} from "@/lib/multichain/http";
import {
  assertMultichainOpen,
  enabledChainForKey,
  ensureDepositAddress,
  MultichainError,
} from "@/lib/multichain/service";

export const runtime = "nodejs";

/** The signed-in owner's deposit address on one network, created on first use. */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonRecord(request);
    if (!body) throw new MultichainError("A valid JSON body is required.", 400);
    const owner = await requireOwner(body.ownerWallet);
    assertMultichainOpen(owner);
    const chain = enabledChainForKey(body.network);
    await requireRateLimit(`multichain-address:${owner}`, 20, 60 * 60);

    const row = await ensureDepositAddress(owner, chain);
    return multichainJson({
      address: row.address,
      minDeposit: chain.minDeposit,
      network: chain.key,
      networkName: chain.name,
      typicalWait: chain.typicalWait,
    });
  } catch (error) {
    return multichainErrorResponse(error);
  }
}
