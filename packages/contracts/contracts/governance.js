/**
 * Who owns and guards SwiftPay contracts.
 *
 *   SWIFTPAY_TIMELOCK_ADDRESS  owner of every contract (deploy with deploy:timelock)
 *   SWIFTPAY_MULTISIG_ADDRESS  guardian: can pause at once, never move funds
 *
 * Testnet falls back to the deployer so scripts keep working. Mainnet refuses
 * to deploy without both, so no mainnet contract is ever owned by one hot key.
 */
import { ethers } from "ethers";

export function isMainnetTarget() {
  if (process.argv.includes("--mainnet")) {
    return true;
  }
  const key = (process.env.ARC_NETWORK || process.env.EARN_NETWORK || "")
    .trim()
    .toLowerCase();
  return key === "arcmainnet" || key === "mainnet";
}

function readAddress(name) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!ethers.isAddress(value)) {
    throw new Error(`${name} is not a valid address.`);
  }
  return ethers.getAddress(value);
}

export function resolveGovernance(deployerAddress, { mainnet = isMainnetTarget() } = {}) {
  const timelock = readAddress("SWIFTPAY_TIMELOCK_ADDRESS");
  const multisig = readAddress("SWIFTPAY_MULTISIG_ADDRESS");

  if (mainnet && (!timelock || !multisig)) {
    throw new Error(
      "Mainnet contracts must be owned by the timelock and guarded by the multisig. " +
        "Set SWIFTPAY_TIMELOCK_ADDRESS and SWIFTPAY_MULTISIG_ADDRESS (see docs/contracts-governance.md).",
    );
  }

  const owner = timelock ?? deployerAddress;
  return { guardian: multisig ?? owner, owner };
}

export function logGovernance({ guardian, owner }, deployerAddress) {
  console.log("Owner:", owner, owner === deployerAddress ? "(deployer — testnet only)" : "(timelock)");
  console.log("Guardian:", guardian);
}

/** RPC for the target network. Mainnet never falls back to a testnet RPC. */
export function arcRpcUrl(mainnet = isMainnetTarget()) {
  const url = mainnet
    ? process.env.ARC_MAINNET_RPC_URL?.trim()
    : process.env.ARC_TESTNET_RPC_URL?.trim() || process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim();
  if (!url) {
    throw new Error(mainnet ? "Set ARC_MAINNET_RPC_URL." : "Set ARC_TESTNET_RPC_URL.");
  }
  return url;
}
