import { type NextRequest } from "next/server";

import { getInvoice, updateInvoice } from "@/lib/account/service";
import type { InvoiceItemInput } from "@/lib/account/types";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid } = await readActor(request);
    const invoice = await getInvoice({
      circleSocialUuid,
      invoiceId: id,
      ownerWallet: actorWallet,
    });
    return jsonOk({ invoice });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const invoice = await updateInvoice({
      allowPartialPayment: body.allowPartialPayment,
      circleSocialUuid,
      currency: body.currency,
      customerCompany: body.customerCompany,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      customerUsername: body.customerUsername,
      dueDate: body.dueDate,
      invoiceId: id,
      issueDate: body.issueDate,
      items: Array.isArray(body.items) ? (body.items as InvoiceItemInput[]) : undefined,
      notes: body.notes,
      ownerWallet: actorWallet,
      paymentTerms: body.paymentTerms,
    });
    return jsonOk({ invoice });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
