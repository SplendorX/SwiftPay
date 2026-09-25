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
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request);
    const auth = await requireBusinessAccount({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId,
    });
    const profile = await loadBusinessProfile(auth.businessWallet || actorWallet);
    return jsonOk({ profile });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request, body);
    const auth = await requireBusinessAccount({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId,
    });
    const profile = await updateBusinessAccountProfile({
      ...body,
      circleSocialUuid,
      ownerWallet: auth.businessWallet || actorWallet,
    });
    return jsonOk({ profile });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
