import { type NextRequest } from "next/server";

import { requireBusinessAccount } from "@/lib/account/auth";
import { loadBusinessProfile, updateBusinessAccountProfile } from "@/lib/account/service";
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
    await requireBusinessAccount({
      circleSocialUuid,
      ownerWallet: actorWallet,
    });
    const profile = await loadBusinessProfile(actorWallet);
    return jsonOk({ profile });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const profile = await updateBusinessAccountProfile({
      ...body,
      circleSocialUuid,
      ownerWallet: actorWallet,
    });
    return jsonOk({ profile });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
