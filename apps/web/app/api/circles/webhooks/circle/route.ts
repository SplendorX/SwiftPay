import { NextResponse, type NextRequest } from "next/server";

import {
  processCircleWebhook,
  verifyCircleWebhookSignature,
} from "@/lib/swift-circle/webhooks";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyCircleWebhookSignature(rawBody, request)) {
    return NextResponse.json({ message: "Unauthorized webhook." }, { status: 401 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid JSON." }, { status: 400 });
  }
  try {
    const result = await processCircleWebhook(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[swift-circle-webhook]", error);
    return NextResponse.json(
      { message: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
