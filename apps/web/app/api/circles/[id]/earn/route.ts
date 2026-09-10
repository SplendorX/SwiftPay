import { type NextRequest } from "next/server";

import { jsonCircleError } from "@/lib/swift-circle/http";
import { circleErrors } from "@/lib/swift-circle/errors";

export const runtime = "nodejs";

function gone() {
  return jsonCircleError(
    circleErrors.invalid("Circle Earn is no longer part of SwiftCircle. Use Circle Save pockets."),
  );
}

export async function GET(_request: NextRequest) {
  return gone();
}

export async function POST(_request: NextRequest) {
  return gone();
}
