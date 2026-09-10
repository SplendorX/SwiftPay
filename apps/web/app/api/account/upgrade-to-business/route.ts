import { type NextRequest } from "next/server";

import { upgradeToBusiness } from "@/lib/account/service";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const state = await upgradeToBusiness({
      businessCategory:
        typeof body.businessCategory === "string" ? body.businessCategory : null,
      businessDescription:
        typeof body.businessDescription === "string"
          ? body.businessDescription
          : null,
      businessName: typeof body.businessName === "string" ? body.businessName : "",
      circleSocialUuid,
      confirmed: body.confirmed === true,
      logoUrl: typeof body.logoUrl === "string" ? body.logoUrl : null,
      ownerWallet: actorWallet,
      website: typeof body.website === "string" ? body.website : null,
    });
    return jsonOk(state);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
