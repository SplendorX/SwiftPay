import { type NextRequest } from "next/server";

import { cancelInvoice } from "@/lib/account/service";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const invoice = await cancelInvoice({
      circleSocialUuid,
      invoiceId: id,
      ownerWallet: actorWallet,
    });
    return jsonOk({ invoice });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
