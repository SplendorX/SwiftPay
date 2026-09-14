import { NextResponse, type NextRequest } from "next/server";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Safely parse and validate an incoming JSON request body.
 * Returns null if:
 * - The body is malformed JSON
 * - The parsed body is null (e.g. `null` payload)
 * - The parsed body is a primitive (e.g. number, string, boolean)
 * - The parsed body is an Array
 */
export async function readJsonRecord<T extends Record<string, unknown> = Record<string, unknown>>(
  request: Request | NextRequest,
): Promise<T | null> {
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}
