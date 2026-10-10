import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Collects Content-Security-Policy-Report-Only violations (see the headers in
 * next.config.mjs): every script the app loads from somewhere not yet on the
 * list. Once the logs show the full set of origins the Circle, WalletConnect
 * and other SDKs need, the policy can be enforced to block injected scripts.
 */
export async function POST(request: Request) {
  const text = (await request.text().catch(() => "")).slice(0, 4_000);
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const reports = Array.isArray(payload) ? payload : [payload];
    for (const entry of reports.slice(0, 10)) {
      const report = ((entry as Record<string, unknown>)["csp-report"] ??
        (entry as Record<string, unknown>).body ??
        entry) as Record<string, unknown>;
      console.warn(
        "[csp-report]",
        report["effective-directive"] ?? report.effectiveDirective ?? report["violated-directive"],
        report["blocked-uri"] ?? report.blockedURL,
        report["document-uri"] ?? report.documentURL,
      );
    }
  } catch {
    // Not JSON: nothing worth logging.
  }
  return new NextResponse(null, { status: 204 });
}
