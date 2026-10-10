import { type NextRequest } from "next/server";

import { readJsonRecord } from "@/lib/http";
import { multichainErrorResponse, multichainJson, requireOwner, requireRateLimit } from "@/lib/multichain/http";
import { readFeeMode } from "@/lib/multichain/rules";
import { listTransfers, startTransfer, transferView } from "@/lib/multichain/send-service";
import { assertMultichainOpen, enabledChainForKey, MultichainError } from "@/lib/multichain/service";

export const runtime = "nodejs";

/** The owner's recent sends to other networks. */
export async function GET(request: NextRequest) {
  try {
    const owner = await requireOwner(request.nextUrl.searchParams.get("ownerWallet"));
    return multichainJson({ transfers: await listTransfers(owner) });
  } catch (error) {
    return multichainErrorResponse(error);
  }
}

/** Open a send before the wallet signs the burn. */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonRecord(request);
    if (!body) throw new MultichainError("A valid JSON body is required.", 400);
    const owner = await requireOwner(body.ownerWallet);
    assertMultichainOpen(owner);
    await requireRateLimit(`multichain-send:${owner}`, 20, 60 * 60);
    const chain = enabledChainForKey(body.network);
    const { quote, transfer } = await startTransfer({
      amount: body.amount,
      chain,
      destination: body.destination,
      feeMode: readFeeMode(body.feeMode),
      owner,
    });
    return multichainJson({ quote, transfer: transferView(transfer) });
  } catch (error) {
    return multichainErrorResponse(error);
  }
}
