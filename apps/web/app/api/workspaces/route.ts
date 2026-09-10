import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import {
  createBusinessWorkspace,
  listWorkspacesForUser,
} from "@/lib/business/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet } = await readActor(request);
    const workspaces = await listWorkspacesForUser(actorWallet);
    return jsonOk({ workspaces });
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
    const workspace = await createBusinessWorkspace({
      name: typeof body.name === "string" ? body.name : "",
      ownerWallet: actorWallet,
      paymentWallet: actorWallet,
      username: typeof body.username === "string" ? body.username : "",
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: workspace.id,
      entityType: "workspace",
      eventType: "BUSINESS_CREATED",
      workspaceId: workspace.id,
    });
    void circleSocialUuid;
    return jsonOk({ workspace }, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
