import { type NextRequest } from "next/server";

import { getBusinessOverview } from "@/lib/account/service";
import { jsonBusinessError, jsonOk, readActor } from "@/lib/business/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid } = await readActor(request);
    const overview = await getBusinessOverview({
      circleSocialUuid,
      ownerWallet: actorWallet,
    });
    return jsonOk(overview);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
