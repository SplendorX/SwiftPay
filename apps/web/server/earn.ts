import { AppKit } from "@circle-fin/app-kit";
import { NextResponse } from "next/server";

import { toJsonSafe } from "@/lib/earn/serialize";
import { isArcMainnet } from "@/lib/network";
import { earnAppKitChain, onchainFacts } from "@/lib/onchain-facts";
import { UsdcAmountError } from "@/lib/onchain-money";

class EarnRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EarnRequestError";
  }
}

type EarnKitInstance = InstanceType<typeof AppKit>;

let vaultKit: EarnKitInstance | null = null;

function getVaultKit() {
  if (!vaultKit) vaultKit = new AppKit();
  return vaultKit;
}

export { toJsonSafe };

export function publicEarnMessage(error: unknown): string {
  if (error instanceof UsdcAmountError || error instanceof EarnRequestError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    const message = error.message.split("\n")[0]?.trim() ?? "";
    if (/private key|entity secret|api key|secret/i.test(message)) {
      return "Earn is not configured correctly on the server.";
    }
    if (message.length > 0) {
      // Truncate rather than discard: a long message still says more than
      // "Earn request failed."
      return message.length < 400 ? message : `${message.slice(0, 300)}…`;
    }
  }
  return "Earn request failed.";
}

export function earnErrorResponse(error: unknown) {
  return NextResponse.json({ error: publicEarnMessage(error) }, { status: 400 });
}

const ERC4626_DECIMALS_SELECTOR = "0x313ce567";
const SUPPORTED_SHARE_DECIMALS = 18;

/** Read an ERC-4626 vault's share decimals, or null when unreadable. */
async function readShareDecimals(vaultAddress: string): Promise<number | null> {
  try {
    const response = await fetch(onchainFacts.rpcUrl, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ data: ERC4626_DECIMALS_SELECTOR, to: vaultAddress }, "latest"],
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as { result?: string };
    if (!payload.result || payload.result === "0x") return null;
    const decimals = Number(BigInt(payload.result));
    return Number.isFinite(decimals) ? decimals : null;
  } catch {
    return null;
  }
}

/**
 * The Arc mainnet vaults SwiftPay offers. App Kit's discovery also returns test
 * vaults and look-alikes that reuse a curator's name at another address (four
 * vaults are called "Steakhouse Prime USDC"), so on mainnet only these are
 * listed. Testnet lists whatever App Kit returns.
 */
const MAINNET_VAULTS = new Set(
  [
    // USDC
    "0x7610094b846657dcf166d59e42973db52c7015f9", // Bitwise Premium RWA USDC
    "0x8e357432cc12ff425c36432f312968aeb16112af", // Galaxy USDC
    "0x5befab92a5a3d60f578cb51eeb4e4fd50a1e3123", // Keyrock Prime USDC
    "0x10af7238c6355aa8ddb5ed60e2e9b55a72827b51", // Gauntlet USDC Balanced
    "0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298", // Steakhouse Prime USDC
    "0xdeccd53be5453215821184824b519e04c7e00bc7", // Gauntlet USDC Prime
    // EURC
    "0x389abdf4355e0cf4f19298179991705a98f21c18", // Galaxy EURC
    "0xbeef00be37bde921bae06fad223125bab16c41d1", // Steakhouse Prime EURC
    "0x05863f54b05e96092069ef30c9ca6060336e50b9", // Gauntlet EURC Prime
  ],
);

function isOfferedVault(address: unknown) {
  if (!isArcMainnet()) return true;
  return typeof address === "string" && MAINNET_VAULTS.has(address.toLowerCase());
}

/**
 * Vault discovery is the only Earn call that needs no signer, so it stays on
 * the server. Everything that moves funds is signed in the browser by the
 * wallet that owns them — see `lib/earn/browser.ts`.
 *
 * Vaults whose shares are not 18 decimals are withheld: the Earn router sizes
 * its minimum-output check in 18 decimals whatever the vault uses, so a
 * 6-decimal vault reverts with `InsufficientOutput` on every deposit. Listing
 * one would only offer a vault nobody can deposit into. A vault whose decimals
 * cannot be read is kept — an RPC hiccup should not empty the list.
 */
export async function listEarnVaults() {
  const result = await getVaultKit().earn.exploreVaults({
    chain: earnAppKitChain(),
    sortBy: "apy",
  });

  const vaults = ((toJsonSafe(result.vaults) ?? []) as Array<
    Record<string, unknown>
  >).filter((vault) => isOfferedVault(vault.vaultAddress));

  const checked = await Promise.all(
    vaults.map(async (vault) => {
      const address = vault.vaultAddress;
      if (typeof address !== "string") return { keep: true, vault };
      const decimals = await readShareDecimals(address);
      return {
        keep: decimals === null || decimals === SUPPORTED_SHARE_DECIMALS,
        vault,
      };
    }),
  );

  return {
    vaults: checked.filter((entry) => entry.keep).map((entry) => entry.vault),
  };
}

/** Whether a vault is one Earn currently lists, so a rule can target it. */
export async function isListedEarnVault(vaultAddress: string) {
  const { vaults } = await listEarnVaults();
  const wanted = vaultAddress.trim().toLowerCase();
  return vaults.some(
    (vault) =>
      typeof vault.vaultAddress === "string" &&
      vault.vaultAddress.toLowerCase() === wanted,
  );
}
