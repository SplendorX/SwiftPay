/**
 * Deploy EarnAutoSaveExecutor against an ERC-4626 vault on Arc.
 *
 * This is what unlocks UNATTENDED auto-deposit: the executor pulls USDC a user
 * has approved and deposits it into the vault for them, called by the
 * operator on a schedule.
 *
 * The contract binds `usdc` and `vault` as immutables and verifies
 * `vault.asset() == usdc` in its constructor, so one deployment serves exactly
 * one vault. Deploy again for another vault.
 *
 *   ARC_TESTNET_RPC_URL           RPC to deploy through
 *   PRIVATE_KEY                   deployer
 *   EARN_VAULT_ADDRESS            ERC-4626 vault to deposit into
 *   SWIFTPAY_EARN_OPERATOR_ADDRESS  address allowed to call executeAutoSave
 *   SWIFTPAY_TIMELOCK_ADDRESS / SWIFTPAY_MULTISIG_ADDRESS  owner and guardian (see governance.js)
 */
import dotenv from "dotenv";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arcRpcUrl, logGovernance, resolveGovernance } from "./governance.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

/** Arc USDC is the native gas token, exposed as an ERC-20 at this address. */
const DEFAULT_ARC_USDC = "0x3600000000000000000000000000000000000000";

async function main() {
  const rpcUrl = arcRpcUrl();
  const privateKey = process.env.PRIVATE_KEY;
  const usdc =
    process.env.NEXT_PUBLIC_USDC_ADDRESS?.trim() || DEFAULT_ARC_USDC;
  const vault = process.env.EARN_VAULT_ADDRESS?.trim();
  const operator =
    process.env.SWIFTPAY_EARN_OPERATOR_ADDRESS?.trim() ||
    process.env.SWIFTPAY_RECURRING_OPERATOR_ADDRESS?.trim();

  if (!rpcUrl || !privateKey) {
    throw new Error("Missing ARC_TESTNET_RPC_URL or PRIVATE_KEY.");
  }
  if (!vault || !ethers.isAddress(vault)) {
    throw new Error(
      "Set EARN_VAULT_ADDRESS to the ERC-4626 vault this executor deposits into.",
    );
  }
  if (!operator || !ethers.isAddress(operator)) {
    throw new Error(
      "Set SWIFTPAY_EARN_OPERATOR_ADDRESS to the address that will run the cron.",
    );
  }
  if (!ethers.isAddress(usdc)) {
    throw new Error("NEXT_PUBLIC_USDC_ADDRESS is not a valid address.");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const governance = resolveGovernance(wallet.address);
  logGovernance(governance, wallet.address);
  const owner = governance.owner;

  // The constructor reverts on a mismatch; checking here gives a readable
  // error instead of an opaque revert.
  const vaultContract = new ethers.Contract(
    vault,
    ["function asset() view returns (address)", "function decimals() view returns (uint8)"],
    provider,
  );
  const asset = await vaultContract.asset();
  if (asset.toLowerCase() !== usdc.toLowerCase()) {
    throw new Error(
      `Vault asset ${asset} does not match USDC ${usdc}. The constructor would revert.`,
    );
  }

  const shareDecimals = Number(await vaultContract.decimals());
  if (shareDecimals !== 18) {
    console.warn(
      `WARNING: vault shares are ${shareDecimals} decimals. Circle's Earn router prices its minimum-output check in 18 decimals, so deposits through the Earn service revert for this vault. Direct executor deposits bypass that router, but confirm before relying on it.`,
    );
  }

  const artifactPath = join(
    __dirname,
    "../artifacts/contracts/earn/EarnAutoSaveExecutor.sol/EarnAutoSaveExecutor.json",
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
  );

  console.log("Deploying EarnAutoSaveExecutor from:", wallet.address);
  console.log("  USDC    :", usdc);
  console.log("  Vault   :", vault);
  console.log("  Operator:", operator);
  console.log("  Owner   :", owner);

  const contract = await factory.deploy(usdc, vault, operator, owner, governance.guardian);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\nEarnAutoSaveExecutor deployed to:", address);
  console.log("\nAdd to your .env:");
  console.log(`NEXT_PUBLIC_EARN_AUTOSAVE_EXECUTOR_ADDRESS=${address}`);
  console.log(
    "SWIFTPAY_EARN_OPERATOR_PRIVATE_KEY=<key for the operator address above>",
  );
  console.log(
    "\nUsers must then approve this address to spend their USDC before unattended deposits can run.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
