import { type NextRequest } from "next/server";

import { listCircleAudit } from "@/lib/swift-circle/audit";
import { requireActiveMember } from "@/lib/swift-circle/auth";
import { jsonCircleError, jsonOk, readActor } from "@/lib/swift-circle/http";
import { assertPermission } from "@/lib/swift-circle/rbac";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    const member = await requireActiveMember(id, actorWallet);
    assertPermission(member, "view_audit");
    const audit = await listCircleAudit(id);
    return jsonOk({ audit });
  } catch (error) {
    return jsonCircleError(error);
  }
}
