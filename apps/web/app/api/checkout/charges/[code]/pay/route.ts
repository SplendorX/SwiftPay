import { type NextRequest } from "next/server";

import { jsonBusinessError, jsonOk, readJsonBody } from "@/lib/business/http";
import { clientIp, noStore, requireRateLimit } from "@/lib/checkout/http";
import { confirmChargePayment } from "@/lib/checkout/service";
import { getSessionOwnerWallet } from "@/lib/referral/auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    await requireRateLimit(`checkout-pay:${clientIp(request)}:${code}`, 20, 60);
    // A bridge mint, a signed-in SaphraONE payer, or any other wallet. Only a
    // label: either way the amount comes from the receipt alone.
    const sessionWallet = await getSessionOwnerWallet();
    const payload = await confirmChargePayment({
      code,
      payerWallet: body.payerWallet,
      source: body.via === "BRIDGE" ? "BRIDGE" : sessionWallet ? "SWIFTPAY" : "WALLET",
      txHash: body.txHash,
    });
    return noStore(jsonOk(payload));
  } catch (error) {
    return noStore(jsonBusinessError(error));
  }
}
