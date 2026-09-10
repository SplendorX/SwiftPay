import { jsonBusinessError, jsonOk } from "@/lib/business/http";
import { getPublicInvoice } from "@/lib/account/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ publicId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { publicId } = await context.params;
    const payload = await getPublicInvoice(publicId, { markViewed: true });
    return jsonOk(payload);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
