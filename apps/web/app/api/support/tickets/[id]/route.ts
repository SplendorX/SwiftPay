import { type NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { addCustomerMessage, readThread, SupportError, verifiedWallet } from "@/lib/support/tickets";

export const runtime = "nodejs";

/** { action: "read" } for the thread; { action: "reply", body } to answer. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJsonRecord(request);
  if (!body) return jsonError("A valid JSON body is required.", 400);
  try {
    const access = { token: body.token, wallet: await verifiedWallet(body.ownerWallet, body.circleSocialUuid) };
    return jsonOk(
      body.action === "reply" ? await addCustomerMessage(id, access, body.body) : await readThread(id, access),
    );
  } catch (error) {
    return error instanceof SupportError
      ? jsonError(error.message, error.status)
      : jsonError("That request couldn't be loaded.", 500);
  }
}
