import { type NextRequest } from "next/server";

import { createInvoice, listInvoices } from "@/lib/account/service";
import type { InvoiceItemInput } from "@/lib/account/types";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid } = await readActor(request);
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const payload = await listInvoices({
      circleSocialUuid,
      ownerWallet: actorWallet,
      page,
    });
    return jsonOk(payload);
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const items = Array.isArray(body.items) ? (body.items as InvoiceItemInput[]) : [];
    const invoice = await createInvoice({
      allowPartialPayment: body.allowPartialPayment,
      circleSocialUuid,
      currency: body.currency,
      customerCompany: body.customerCompany,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      customerUsername: body.customerUsername,
      customerWallet: body.customerWallet,
      dueDate: body.dueDate,
      invoiceNumber: body.invoiceNumber,
      issueDate: body.issueDate,
      items,
      notes: body.notes,
      origin: request.nextUrl.origin,
      ownerWallet: actorWallet,
      paymentTerms: body.paymentTerms,
    });
    return jsonOk({ invoice }, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
