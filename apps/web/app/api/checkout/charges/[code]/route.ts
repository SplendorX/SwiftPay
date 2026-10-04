import { type NextRequest } from "next/server";

import { jsonBusinessError, jsonOk } from "@/lib/business/http";
import { clientIp, noStore, requireRateLimit } from "@/lib/checkout/http";
import { getPublicCharge } from "@/lib/checkout/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    await requireRateLimit(`checkout-view:${clientIp(request)}:${code}`, 120, 60);
    return noStore(jsonOk(await getPublicCharge(code)));
  } catch (error) {
    return noStore(jsonBusinessError(error));
  }
}
