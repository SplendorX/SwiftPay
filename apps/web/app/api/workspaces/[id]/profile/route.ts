import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { updateBusinessProfile } from "@/lib/business/profile";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const result = await updateBusinessProfile({
      addressLine: body.addressLine,
      category: body.category,
      circleSocialUuid,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      country: body.country,
      description: body.description,
      logoUrl: body.logoUrl,
      name: body.name,
      ownerWallet: actorWallet,
      socialLinks: body.socialLinks,
      username: body.username,
      website: body.website,
      workspaceId: id,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: id,
      entityType: "profile",
      eventType: "BUSINESS_UPDATED",
      workspaceId: id,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
