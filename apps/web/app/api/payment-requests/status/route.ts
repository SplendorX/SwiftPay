import { NextResponse, type NextRequest } from "next/server";

import { readPaymentRequestLifecycle } from "@/lib/save/notifications";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("requestId")?.trim() ?? "";

  if (!requestId) {
    return jsonError("A payment request id is required.", 400);
  }

  try {
    const status = await readPaymentRequestLifecycle(requestId);
    return NextResponse.json({
      payable: status === "pending" || status === "unknown",
      requestId,
      status,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Payment request status could not be loaded.";
    return jsonError(message, 500);
  }
}
