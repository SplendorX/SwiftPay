import { type NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { createTicket, SupportError, verifiedWallet } from "@/lib/support/tickets";

export const runtime = "nodejs";

/** Open a support request — from a signed-in wallet, or a guest with an email. */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (!body) return jsonError("A valid JSON body is required.", 400);
  try {
    const wallet = await verifiedWallet(body.ownerWallet, body.circleSocialUuid);
    return jsonOk(
      await createTicket({
        email: body.email,
        message: body.message,
        pagePath: body.pagePath,
        subject: body.subject,
        transcript: body.transcript,
        wallet,
      }),
      201,
    );
  } catch (error) {
    return error instanceof SupportError
      ? jsonError(error.message, error.status)
      : jsonError("Your request couldn't be sent. Try again in a moment.", 500);
  }
}
