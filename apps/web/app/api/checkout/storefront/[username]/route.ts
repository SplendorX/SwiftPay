import { type NextRequest } from "next/server";

import { jsonBusinessError, jsonOk } from "@/lib/business/http";
import { clientIp, noStore, requireRateLimit } from "@/lib/checkout/http";
import { getPublicStorefront } from "@/lib/checkout/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ username: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { username } = await context.params;
    await requireRateLimit(`checkout-storefront:${clientIp(request)}`, 60, 60);
    return noStore(jsonOk(await getPublicStorefront(username)));
  } catch (error) {
    return noStore(jsonBusinessError(error));
  }
}
