import { type NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { listTickets, SupportError, verifiedWallet } from "@/lib/support/tickets";

export const runtime = "nodejs";

/** The customer's requests. POST so guest access tokens stay out of URLs. */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (!body) return jsonError("A valid JSON body is required.", 400);
  try {
    const wallet = await verifiedWallet(body.ownerWallet, body.circleSocialUuid);
    return jsonOk({ tickets: await listTickets({ tokens: body.tokens, wallet }) });
  } catch (error) {
    return error instanceof SupportError
      ? jsonError(error.message, error.status)
      : jsonError("Your requests couldn't be loaded.", 500);
  }
}
