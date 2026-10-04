import { KitError } from "@circle-fin/onramp-kit/server";
import { NextResponse, type NextRequest } from "next/server";

import { jsonBusinessError } from "@/lib/business/http";
import { checkoutErrors } from "@/lib/checkout/errors";
import { clientIp, noStore, requireRateLimit } from "@/lib/checkout/http";
import { startChargeOnramp } from "@/lib/checkout/service";
import { onrampServer, onrampSessionInput } from "@/lib/onramp-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * A Circle Onramp session that pays this charge: USDC on Arc straight to the
 * merchant wallet, read from the charge, never from the request. The guest
 * is identified to Circle only by the charge code.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const server = onrampServer();
    if (!server) throw checkoutErrors.onrampUnavailable();
    await requireRateLimit(`checkout-onramp:${code.toUpperCase()}`, 10, 3600);
    await requireRateLimit(`checkout-onramp-ip:${clientIp(request)}`, 20, 3600);

    const { destinationWallet, payload } = await startChargeOnramp(code);
    try {
      const session = await server.createSession(
        onrampSessionInput({
          appUserId: `charge:${payload.charge.code}`,
          destinationAddress: destinationWallet,
        }),
      );
      return noStore(NextResponse.json({ charge: payload.charge, session }));
    } catch (error) {
      console.warn(
        "[checkout] onramp session failed",
        error instanceof KitError ? `${error.type} ${error.code}` : error,
      );
      if (error instanceof KitError && error.type === "RATE_LIMIT") throw checkoutErrors.rateLimited();
      throw checkoutErrors.onrampUnavailable();
    }
  } catch (error) {
    return noStore(jsonBusinessError(error));
  }
}
