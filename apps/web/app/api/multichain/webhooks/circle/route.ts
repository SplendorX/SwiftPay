import { after, NextResponse, type NextRequest } from "next/server";

import { verifyCircleWebhook } from "@/lib/circle-webhook-signature";
import { processDepositAddress } from "@/lib/multichain/service";
import { findDepositAddressByWalletId } from "@/lib/multichain/store";

export const runtime = "nodejs";
export const maxDuration = 300;

type CircleNotification = {
  notificationType?: string;
  notification?: { walletId?: string; transactionType?: string };
};

/**
 * Circle `transactions.*` notifications for deposit wallets. The payload only
 * says which wallet moved; what arrived is read back from Circle, so a forged
 * or replayed notification can at most trigger an extra check.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!(await verifyCircleWebhook(rawBody, request.headers))) {
    return NextResponse.json({ message: "Unauthorized webhook." }, { status: 401 });
  }

  let payload: CircleNotification;
  try {
    payload = JSON.parse(rawBody) as CircleNotification;
  } catch {
    return NextResponse.json({ message: "Invalid JSON." }, { status: 400 });
  }

  // Circle's endpoint test sends a bare ping.
  const walletId = payload.notification?.walletId;
  if (!payload.notificationType?.startsWith("transactions.") || !walletId) {
    return NextResponse.json({ ignored: true });
  }

  const address = await findDepositAddressByWalletId(walletId).catch(() => null);
  if (!address) return NextResponse.json({ ignored: true });

  after(async () => {
    await processDepositAddress(address);
  });
  return NextResponse.json({ accepted: true });
}
