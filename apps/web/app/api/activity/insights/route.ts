import { type NextRequest } from "next/server";

import { monthKey, monthRange, previousMonthKey, summarizeMonth } from "@/lib/activity/insights";
import { loadActivityItems } from "@/lib/activity/report";
import { jsonError, jsonOk } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { assertRecurringAccess, normalizeOwnerWallet } from "@/lib/recurring-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Insights for this month and last: money in and out per day and per
 * feature. Totals only; the transactions themselves stay on the Activity list
 * (last 30 days) and in statements.
 *
 * `tz` is the viewer's Date#getTimezoneOffset(), so months follow their clock.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ownerWallet = normalizeOwnerWallet(params.get("ownerWallet"));
  if (!ownerWallet) return jsonError("A valid owner wallet is required.", 400);

  const canAccess = await assertRecurringAccess({
    circleSocialUuid: params.get("circleSocialUuid"),
    ownerWallet,
  });
  if (!canAccess) return jsonError("Authorize this wallet before loading insights.", 401);

  const tzRaw = Number(params.get("tz") ?? "0");
  const tz = Number.isFinite(tzRaw) && Math.abs(tzRaw) <= 14 * 60 ? Math.round(tzRaw) : 0;

  if (!(await consumeRateLimit(`insights:${ownerWallet}`, 30, 60))) {
    return jsonError("Too many requests. Try again in a minute.", 429);
  }

  try {
    const now = Date.now();
    const current = monthKey(now, tz);
    const previous = previousMonthKey(current);
    const from = monthRange(previous, tz).from;
    const items = await loadActivityItems(ownerWallet, { from, to: new Date(now) });
    return jsonOk({
      current: summarizeMonth(items, current, tz, now),
      generatedAt: new Date(now).toISOString(),
      previous: summarizeMonth(items, previous, tz, now),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Insights couldn't be loaded.", 500);
  }
}
