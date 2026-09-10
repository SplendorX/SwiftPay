import { type NextRequest } from "next/server";

import { requireWorkspaceContext } from "@/lib/business/auth";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { listPayments, paymentAnalytics } from "@/lib/business/payments";
import { permissionsForRole } from "@/lib/business/permissions";
import { attachBusinessWallet, loadBusinessDetail } from "@/lib/business/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid } = await readActor(request);
    const { member, workspace } = await requireWorkspaceContext({
      circleSocialUuid,
      ownerWallet: actorWallet,
      permission: "business.view",
      workspaceId: id,
    });
    const range = Number(request.nextUrl.searchParams.get("range") ?? "30");
    const [detail, payments, analytics] = await Promise.all([
      loadBusinessDetail(id),
      listPayments({
        circleSocialUuid,
        ownerWallet: actorWallet,
        tab: "all",
        workspaceId: id,
      }),
      paymentAnalytics({
        circleSocialUuid,
        ownerWallet: actorWallet,
        rangeDays: [7, 30, 90, 365].includes(range) ? range : 30,
        workspaceId: id,
      }),
    ]);

    return jsonOk({
      analytics,
      member,
      payments,
      permissions: permissionsForRole(member.role),
      profile: detail.profile,
      settings: detail.settings,
      workspace,
    });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const workspace = await attachBusinessWallet({
      circleSocialUuid,
      circleWalletId:
        typeof body.circleWalletId === "string" ? body.circleWalletId : null,
      ownerWallet: actorWallet,
      paymentWallet:
        typeof body.paymentWallet === "string" ? body.paymentWallet : "",
      workspaceId: id,
    });
    return jsonOk({ workspace });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
