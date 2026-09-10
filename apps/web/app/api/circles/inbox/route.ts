import { type NextRequest } from "next/server";

import { jsonCircleError, jsonOk, readActor } from "@/lib/swift-circle/http";
import { listInboxInvitations } from "@/lib/swift-circle/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet } = await readActor(request);
    const invitations = await listInboxInvitations(actorWallet);
    return jsonOk({ invitations });
  } catch (error) {
    return jsonCircleError(error);
  }
}
