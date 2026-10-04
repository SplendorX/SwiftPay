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
    // Signed-in payers paid through SwiftPay, everyone else from a wallet.
    // Either way the amount comes from the receipt alone.
    const sessionWallet = await getSessionOwnerWallet();
    const payload = await confirmChargePayment({
      code,
      payerWallet: body.payerWallet,
      source: sessionWallet ? "SWIFTPAY" : "WALLET",
      txHash: body.txHash,
    });
    return noStore(jsonOk(payload));
  } catch (error) {
    return noStore(jsonBusinessError(error));
  }
}
