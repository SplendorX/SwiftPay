// Server-only. Who really sent an Arc mint that was a multichain sweep.
//
// On Arc a swept deposit arrives as a CCTP mint, so the chain shows the zero
// address as its sender ("Mint"). The person who paid is the sender of the
// deposit on the other network, kept in chain_deposits.
import { multichainChainByCircleBlockchain } from "@/lib/multichain/chains";
import { multichainEnabled } from "@/lib/multichain/flag";
import { listDepositsBySweepIds, sweepsByMintHashes } from "@/lib/multichain/store";

export type MintSender = {
  network: string;
  networkName: string;
  /** The payer's address on that network; null when a sweep carried several payers. */
  sender: string | null;
  /** "0x6f97…464f on Base", or "Base" when the payer is not one address. */
  label: string;
};

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function mintSenderLabel(networkName: string, sender: string | null) {
  return sender ? `${short(sender)} on ${networkName}` : networkName;
}

/** Mint hash (lowercase) to the deposit's sender, for the owner's credited sweeps. */
export async function mintSenders(ownerWallet: string, hashes: string[]) {
  const result: Record<string, MintSender> = {};
  const wanted = [...new Set(hashes.map((hash) => hash.toLowerCase()))];
  // With the feature off the tables may not exist yet (production).
  if (!multichainEnabled || wanted.length === 0) return result;

  const sweeps = await sweepsByMintHashes(ownerWallet, wanted);
  if (sweeps.length === 0) return result;
  const deposits = await listDepositsBySweepIds(sweeps.map((sweep) => sweep.id));

  for (const sweep of sweeps) {
    const chain = multichainChainByCircleBlockchain(sweep.chain);
    if (!sweep.mint_tx_hash || !chain) continue;
    const senders = new Set(
      deposits
        .filter((row) => row.sweep_id === sweep.id && row.sender_address)
        .map((row) => row.sender_address!.toLowerCase()),
    );
    const sender = senders.size === 1 ? [...senders][0] : null;
    result[sweep.mint_tx_hash.toLowerCase()] = {
      label: mintSenderLabel(chain.name, sender),
      network: chain.key,
      networkName: chain.name,
      sender,
    };
  }
  return result;
}
