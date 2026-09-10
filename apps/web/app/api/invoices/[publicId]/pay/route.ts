import { type NextRequest } from "next/server";

import { confirmInvoicePayment } from "@/lib/account/service";
import { jsonBusinessError, jsonOk, readJsonBody } from "@/lib/business/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ publicId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { publicId } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const payload = await confirmInvoicePayment({
      amount: typeof body.amount === "string" ? body.amount : "",
      asset: body.asset,
      publicId,
      txHash: typeof body.txHash === "string" ? body.txHash : "",
    });
    return jsonOk(payload);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
