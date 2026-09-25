import { type NextRequest } from "next/server";

import { emailInvoice } from "@/lib/account/service";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Email (or re-email) an open invoice to its customer. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request, body);
    const invoice = await emailInvoice({
      circleSocialUuid,
      invoiceId: id,
      ownerWallet: actorWallet,
      toEmail: body?.email,
      workspaceId,
    });
    return jsonOk({ invoice });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
