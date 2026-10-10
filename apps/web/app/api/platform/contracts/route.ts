import { NextResponse } from "next/server";

import { getSaphraSendAddress, swiftBatchFeeRecipient } from "@/lib/contracts";
import { swiftSaveVaultAddress } from "@/lib/save/config";

export const runtime = "nodejs";

/** Public on-chain addresses. Read at request time from server env. */
export async function GET() {
  return NextResponse.json({
    sendRouter: getSaphraSendAddress(),
    feeRecipient: swiftBatchFeeRecipient,
    saveVault: swiftSaveVaultAddress() ?? "",
  });
}
