import { type NextRequest } from "next/server";

import { jsonBusinessError, jsonOk, readJsonBody } from "@/lib/business/http";
import { clientIp, noStore, requireRateLimit } from "@/lib/checkout/http";
import { setChargeTip } from "@/lib/checkout/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    await requireRateLimit(`checkout-tip:${clientIp(request)}:${code}`, 30, 60);
    return noStore(jsonOk(await setChargeTip({ code, tip: body.tip })));
  } catch (error) {
    return noStore(jsonBusinessError(error));
  }
}
