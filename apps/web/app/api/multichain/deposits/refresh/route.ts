import { after, type NextRequest } from "next/server";

import { readJsonRecord } from "@/lib/http";
import {
  multichainErrorResponse,
  multichainJson,
  requireOwner,
  requireRateLimit,
} from "@/lib/multichain/http";
import {
  assertMultichainOpen,
  detectDeposits,
  processDepositAddress,
} from "@/lib/multichain/service";
import { listDepositAddresses } from "@/lib/multichain/store";
import { multichainOverview } from "@/lib/multichain/view";

export const runtime = "nodejs";
// The sweep runs after the response and can wait on Circle's attestation.
export const maxDuration = 300;

/**
 * "Check now" from an open receive screen. New transfers are recorded before
 * the response, so "Arriving" shows at once; the sweep to Arc runs after it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await readJsonRecord(request)) ?? {};
    const owner = await requireOwner(body.ownerWallet);
    assertMultichainOpen(owner);
    await requireRateLimit(`multichain-refresh:${owner}`, 20, 60);

    const addresses = await listDepositAddresses(owner);
    const found = await Promise.all(addresses.map((address) => detectDeposits(address).catch(() => 0)));
    after(async () => {
      for (const address of addresses) await processDepositAddress(address);
    });

    return multichainJson({
      ...(await multichainOverview(owner)),
      found: found.reduce((sum, count) => sum + count, 0),
    });
  } catch (error) {
    return multichainErrorResponse(error);
  }
}
