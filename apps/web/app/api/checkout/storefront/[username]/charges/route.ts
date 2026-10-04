import { type NextRequest } from "next/server";

import { jsonBusinessError, jsonOk, readJsonBody } from "@/lib/business/http";
import { clientIp, noStore, requireRateLimit } from "@/lib/checkout/http";
import { createStorefrontCharge } from "@/lib/checkout/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ username: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { username } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    await requireRateLimit(`checkout-storefront-create:${clientIp(request)}`, 10, 60);
    await requireRateLimit(
      `checkout-storefront-merchant:${decodeURIComponent(username).toLowerCase()}`,
      60,
      3600,
    );
    const { code } = await createStorefrontCharge({
      amount: body.amount,
      currency: body.currency,
      tip: body.tip,
      username,
    });
    return noStore(jsonOk({ code }, 201));
  } catch (error) {
    return noStore(jsonBusinessError(error));
  }
}
