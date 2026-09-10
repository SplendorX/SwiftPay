import { jsonCircleError, jsonOk } from "@/lib/swift-circle/http";
import { loadPlatformLimits } from "@/lib/swift-circle/limits";

export const runtime = "nodejs";

export async function GET() {
  try {
    const limits = await loadPlatformLimits();
    return jsonOk({ limits });
  } catch (error) {
    return jsonCircleError(error);
  }
}
