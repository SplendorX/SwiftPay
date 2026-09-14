import { NextResponse, type NextRequest } from "next/server";

import { readIdempotencyKey } from "@/lib/save/idempotency";
import { requireActorWallet } from "@/lib/swift-circle/auth";
import { isCircleHttpError, publicCircleError } from "@/lib/swift-circle/errors";
import { newRequestId } from "@/lib/swift-circle/logging";

export async function readJsonBody(request: NextRequest) {
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function jsonCircleError(error: unknown) {
  if (isCircleHttpError(error)) {
    return NextResponse.json(
      { message: error.userMessage, code: error.code },
      { status: error.status },
    );
  }
  const mapped = publicCircleError(error);
  if (mapped.code === "INTERNAL") {
    console.error("[swift-circle]", error);
  }
  return NextResponse.json(
    { message: mapped.message, code: mapped.code },
    { status: mapped.status },
  );
}

export async function readActor(request: NextRequest, body?: Record<string, unknown> | null) {
  const ownerWallet =
    body?.ownerWallet ?? request.nextUrl.searchParams.get("ownerWallet");
  const circleSocialUuid =
    body?.circleSocialUuid ?? request.nextUrl.searchParams.get("circleSocialUuid");
  const actorWallet = await requireActorWallet({ ownerWallet, circleSocialUuid });
  return {
    actorWallet,
    requestId: request.headers.get("x-request-id") ?? newRequestId(),
    idempotencyKey: readIdempotencyKey(request, body ?? undefined),
  };
}
