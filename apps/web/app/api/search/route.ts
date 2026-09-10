import { type NextRequest } from "next/server";

import { jsonBusinessError, jsonOk } from "@/lib/business/http";
import { searchDirectory } from "@/lib/business/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const results = await searchDirectory(query);
    return jsonOk({ results });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
