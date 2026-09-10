import { NextResponse, type NextRequest } from "next/server";

import { isBusinessHttpError } from "@/lib/business/errors";
import { requireActorWallet } from "@/lib/business/auth";
import { readIdempotencyKey } from "@/lib/save/idempotency";
import { CircleHttpError } from "@/lib/swift-circle/errors";

export async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function jsonBusinessError(error: unknown) {
  if (isBusinessHttpError(error) || error instanceof CircleHttpError) {
    return NextResponse.json(
      { message: error.userMessage, code: error.code },
      { status: error.status },
    );
  }

  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  console.error("[swiftpay-business]", error);
  return NextResponse.json({ message }, { status: 500 });
}

export async function readActor(
  request: NextRequest,
  body?: Record<string, unknown> | null,
) {
  const ownerWallet =
    body?.ownerWallet ?? request.nextUrl.searchParams.get("ownerWallet");
  const circleSocialUuid =
    body?.circleSocialUuid ??
    request.nextUrl.searchParams.get("circleSocialUuid");
  const actorWallet = await requireActorWallet({
    ownerWallet,
    circleSocialUuid,
  });

  return {
    actorWallet,
    circleSocialUuid:
      typeof circleSocialUuid === "string" ? circleSocialUuid : undefined,
    idempotencyKey: readIdempotencyKey(request, body ?? undefined),
  };
}
