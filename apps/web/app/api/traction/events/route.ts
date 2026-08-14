import { NextResponse } from "next/server";

import { recordTractionEvent } from "@/lib/traction/service";

export const runtime = "nodejs";

type TractionEventBody = {
  amount?: unknown;
  chainId?: unknown;
  circleSocialUuid?: unknown;
  currency?: unknown;
  eventType?: unknown;
  metadata?: unknown;
  pathname?: unknown;
  sessionId?: unknown;
  source?: unknown;
  txHash?: unknown;
  walletAddress?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asMetadata(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function POST(request: Request) {
  let body: TractionEventBody;

  try {
    body = (await request.json()) as TractionEventBody;
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  try {
    await recordTractionEvent({
      amount: asString(body.amount),
      chainId: asNumber(body.chainId),
      circleSocialUuid: asString(body.circleSocialUuid),
      currency: asString(body.currency),
      eventType: asString(body.eventType) ?? "",
      metadata: asMetadata(body.metadata),
      pathname: asString(body.pathname),
      referrer: request.headers.get("referer") ?? undefined,
      sessionId: asString(body.sessionId),
      source: asString(body.source),
      txHash: asString(body.txHash),
      userAgent: request.headers.get("user-agent") ?? undefined,
      walletAddress: asString(body.walletAddress),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not record event.";
    const isConfigError = message.includes("Supabase service credentials");

    return NextResponse.json(
      {
        message,
      },
      { status: isConfigError ? 500 : 400 },
    );
  }
}
