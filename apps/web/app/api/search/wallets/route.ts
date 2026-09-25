import { type NextRequest } from "next/server";

import { agentWalletOwners } from "@/lib/agent-wallet/config";
import { jsonBusinessError, jsonOk } from "@/lib/business/http";
import { usernamesForWallets } from "@/lib/business/service";
import { jsonError, readJsonRecord } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Resolve wallet addresses to public SwiftPay @usernames.
 *
 * `agentOwners` separately names whose ALLIE Agent Wallet an address is, so a
 * payment ALLIE made can read "@owner via ALLIE". It is kept apart from
 * `usernames` on purpose: an Agent Wallet is not its owner's address, and a
 * pasted one must not look like it is.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (!body || !Array.isArray(body.wallets)) {
    return jsonError("A list of wallets is required.", 400);
  }

  try {
    const wallets = body.wallets.filter(
      (value): value is string => typeof value === "string",
    );
    const owners = await agentWalletOwners(wallets).catch(
      () => ({}) as Record<string, string>,
    );
    const usernames = await usernamesForWallets([
      ...wallets,
      ...Object.values(owners),
    ]);
    const agentOwners = Object.fromEntries(
      Object.entries(owners).map(([agent, owner]) => [
        agent,
        { owner, username: usernames[owner] ?? null },
      ]),
    );
    const requested = new Set(wallets.map((wallet) => wallet.toLowerCase()));
    return jsonOk({
      agentOwners,
      usernames: Object.fromEntries(
        Object.entries(usernames).filter(([wallet]) => requested.has(wallet)),
      ),
    });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
