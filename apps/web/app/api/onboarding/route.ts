import { type NextRequest } from "next/server";

import {
  completeOnboarding,
  listWorkspacesForUser,
  loadUserProfile,
} from "@/lib/business/service";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet } = await readActor(request);
    const [profile, workspaces] = await Promise.all([
      loadUserProfile(actorWallet),
      listWorkspacesForUser(actorWallet),
    ]);
    return jsonOk({ invitations: [], profile, workspaces });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) {
      throw new Error("A valid JSON body is required.");
    }
    const { actorWallet, circleSocialUuid } = await readActor(request, body);

    const result = await completeOnboarding({
      accountKind:
        body.accountKind === "business" ? "business" : "individual",
      bio: typeof body.bio === "string" ? body.bio : null,
      fullName: typeof body.fullName === "string" ? body.fullName : null,
      businessName: typeof body.businessName === "string" ? body.businessName : undefined,
      businessUsername:
        typeof body.businessUsername === "string" ? body.businessUsername : undefined,
      circleSocialUuid,
      locale: typeof body.locale === "string" ? body.locale : "en",
      ownerWallet: actorWallet,
      username: typeof body.username === "string" ? body.username : "",
    });
    return jsonOk(result);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
