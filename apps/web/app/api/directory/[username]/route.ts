import { type NextRequest } from "next/server";

import { businessErrors } from "@/lib/business/errors";
import { jsonBusinessError, jsonOk } from "@/lib/business/http";
import { getPublicDirectoryProfile } from "@/lib/business/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ username: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { username } = await context.params;
    const profile = await getPublicDirectoryProfile(username);
    if (!profile) {
      throw businessErrors.notFound("Profile");
    }
    return jsonOk({ profile });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
