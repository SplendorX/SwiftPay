import { type NextRequest } from "next/server";

import { jsonBusinessError, jsonOk, readJsonBody } from "@/lib/business/http";
import { clientIp, noStore, requireRateLimit } from "@/lib/checkout/http";
import { reportChargeSettled } from "@/lib/checkout/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };

/** The card/bank widget or a bridge reports the payment is on its way. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    await requireRateLimit(`checkout-settled:${clientIp(request)}:${code}`, 10, 60);
    const payload = await reportChargeSettled({
      amount: body.amount,
      code,
      reference: body.reference,
      tokenSymbol: body.tokenSymbol,
    });
    return noStore(jsonOk(payload));
  } catch (error) {
    return noStore(jsonBusinessError(error));
  }
}
