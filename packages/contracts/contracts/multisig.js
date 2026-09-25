/**
 * SwiftPay multisig + timelock CLI. See docs/contracts-governance.md.
 *
 *   create   --owners 0xA,0xB,0xC --threshold 2         deploy the Safe
 *   pause    --target 0x...                             guardian: propose pause()
 *   guardian --target 0x... --call "emergencyWithdrawFromStrategy()"   other guardian calls
 *   schedule --target 0x... --call "setOperator(address)" --args '["0x..."]' [--label x]
 *                                                       propose timelock.schedule(...)
 *   execute-op <deployments/timelock-ops/...json>        propose timelock.execute(...) once the delay passed
 *   approve  <deployments/safe-txs/...json>              approve as SAFE_SIGNER_KEY (or PRIVATE_KEY)
 *   exec     <deployments/safe-txs/...json>              execute once approved (any account)
 *   status   <deployments/safe-txs/...json | timelock-ops/...json>
 *
 * Add --mainnet for Arc mainnet. Reads SWIFTPAY_MULTISIG_ADDRESS and
 * SWIFTPAY_TIMELOCK_ADDRESS from the root .env or the environment.
 */
import dotenv from "dotenv";
import { ethers } from "ethers";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { arcRpcUrl, isMainnetTarget } from "./governance.js";
import {
  approveSafeTx,
  createSafe,
  executeSafeTx,
  proposeSafeTx,
  readSafeTx,
  safeContract,
  safeTxStatus,
} from "./lib/safe.js";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const TIMELOCK_ABI = [
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt) payable",
  "function getMinDelay() view returns (uint256)",
  "function hashOperation(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "function isOperationReady(bytes32 id) view returns (bool)",
  "function isOperationDone(bytes32 id) view returns (bool)",
];

const opsDir = join(dirname(fileURLToPath(import.meta.url)), "../deployments/timelock-ops");

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requireAddress(value, what) {
  if (!value || !ethers.isAddress(value)) throw new Error(`${what} must be a valid address.`);
  return ethers.getAddress(value);
}

function multisigAddress() {
  return requireAddress(process.env.SWIFTPAY_MULTISIG_ADDRESS?.trim(), "SWIFTPAY_MULTISIG_ADDRESS");
}

function timelockAddress() {
  return requireAddress(process.env.SWIFTPAY_TIMELOCK_ADDRESS?.trim(), "SWIFTPAY_TIMELOCK_ADDRESS");
}

function signer(provider) {
  const key = process.env.SAFE_SIGNER_KEY?.trim() || process.env.PRIVATE_KEY?.trim();
  if (!key) throw new Error("Set SAFE_SIGNER_KEY (or PRIVATE_KEY) to sign.");
  return new ethers.Wallet(key, provider);
}

function encodeCall(signature, args) {
  const fragment = ethers.FunctionFragment.from(signature.startsWith("function ") ? signature : `function ${signature}`);
  return new ethers.Interface([fragment]).encodeFunctionData(fragment, args);
}

function printSafeTx(file, tx) {
  console.log(`Proposed Safe transaction #${tx.nonce}: ${tx.label}`);
  console.log("  safeTxHash:", tx.safeTxHash);
  console.log("  file      :", file);
  console.log("Next: each signer runs  approve", file);
  console.log("      then anyone runs  exec", file);
}

async function main() {
  // Positional arguments: everything that is neither a --flag nor a flag's value.
  const positional = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--mainnet") continue;
    if (argv[i].startsWith("--")) {
      i += 1;
      continue;
    }
    positional.push(argv[i]);
  }
  const [command, fileArg] = positional;
  const mainnet = isMainnetTarget();
  const provider = new ethers.JsonRpcProvider(arcRpcUrl(mainnet));
  console.log(`Network: ${mainnet ? "Arc mainnet" : "Arc testnet"} (chain ${(await provider.getNetwork()).chainId})`);

  switch (command) {
    case "create": {
      const owners = (flag("owners") ?? "").split(",").map((owner) => requireAddress(owner.trim(), "Each owner"));
      const threshold = Number(flag("threshold"));
      if (new Set(owners.map((owner) => owner.toLowerCase())).size !== owners.length) {
        throw new Error("Owners must be distinct.");
      }
      if (!Number.isInteger(threshold) || threshold < 2 || threshold > owners.length) {
        throw new Error("--threshold must be at least 2 and at most the number of owners.");
      }
      const { address, txHash } = await createSafe(signer(provider), owners, threshold);
      const safe = safeContract(address, provider);
      console.log("Safe created:", address, `(${await safe.getThreshold()} of ${(await safe.getOwners()).length})`);
      console.log("  tx:", txHash);
      console.log(`\nSWIFTPAY_MULTISIG_ADDRESS=${address}`);
      return;
    }

    case "pause":
    case "guardian": {
      // Guardian calls go straight from the Safe, with no timelock delay. The
      // contracts only let the guardian pause or pull strategy funds home.
      const target = requireAddress(flag("target"), "--target");
      const call = command === "pause" ? "pause()" : flag("call");
      if (!call) throw new Error('--call is required, e.g. --call "emergencyWithdrawFromStrategy()"');
      const { file, tx } = await proposeSafeTx(provider, multisigAddress(), {
        data: encodeCall(call, flag("args") ? JSON.parse(flag("args")) : []),
        label: `guardian ${call} on ${target}`,
        to: target,
      });
      printSafeTx(file, tx);
      return;
    }

    case "schedule": {
      const target = requireAddress(flag("target"), "--target");
      const call = flag("call");
      if (!call) throw new Error('--call is required, e.g. --call "unpause()"');
      const args = flag("args") ? JSON.parse(flag("args")) : [];
      const data = encodeCall(call, args);
      const timelock = new ethers.Contract(timelockAddress(), TIMELOCK_ABI, provider);
      const delay = await timelock.getMinDelay();
      const label = flag("label") ?? `${call} on ${target}`;
      const salt = ethers.id(`${label}:${Date.now()}`);
      const id = await timelock.hashOperation(target, 0, data, ethers.ZeroHash, salt);

      const op = { args, call, data, delay: delay.toString(), id, label, salt, target, timelock: timelockAddress() };
      mkdirSync(opsDir, { recursive: true });
      const opFile = join(opsDir, `${id.slice(0, 12)}.json`);
      writeFileSync(opFile, JSON.stringify(op, null, 2));

      const { file, tx } = await proposeSafeTx(provider, multisigAddress(), {
        data: timelock.interface.encodeFunctionData("schedule", [target, 0, data, ethers.ZeroHash, salt, delay]),
        label: `schedule: ${label}`,
        to: op.timelock,
      });
      printSafeTx(file, tx);
      console.log(`\nTimelock operation ${id}`);
      console.log(`  saved to ${opFile}`);
      console.log(`  after the Safe transaction runs, wait ${delay}s, then: execute-op ${opFile}`);
      return;
    }

    case "execute-op": {
      const op = JSON.parse(readFileSync(fileArg, "utf8"));
      const timelock = new ethers.Contract(op.timelock, TIMELOCK_ABI, provider);
      if (await timelock.isOperationDone(op.id)) throw new Error("Already executed.");
      const readyAt = await timelock.getTimestamp(op.id);
      if (readyAt === 0n) throw new Error("Not scheduled yet: run the schedule Safe transaction first.");
      if (!(await timelock.isOperationReady(op.id))) {
        throw new Error(`Still in its delay. Ready at ${new Date(Number(readyAt) * 1000).toISOString()}.`);
      }
      const { file, tx } = await proposeSafeTx(provider, multisigAddress(), {
        data: timelock.interface.encodeFunctionData("execute", [op.target, 0, op.data, ethers.ZeroHash, op.salt]),
        label: `execute: ${op.label}`,
        to: op.timelock,
      });
      printSafeTx(file, tx);
      return;
    }

    case "approve": {
      const tx = readSafeTx(fileArg);
      const account = signer(provider);
      const hash = await approveSafeTx(account, tx);
      console.log(hash ? `Approved by ${account.address}: ${hash}` : `${account.address} had already approved.`);
      const status = await safeTxStatus(provider, tx);
      console.log(`Approvals: ${status.approved.length} of ${status.threshold} needed`);
      return;
    }

    case "exec": {
      const tx = readSafeTx(fileArg);
      const account = signer(provider);
      const { approved, owners } = await safeTxStatus(provider, tx, account.address);
      if (owners.some((owner) => owner.toLowerCase() === account.address.toLowerCase())) {
        console.log(`${account.address} is a signer: executing counts as its approval.`);
      }
      console.log(`Approvals: ${approved.join(", ")}`);
      const hash = await executeSafeTx(account, tx);
      console.log(`Executed Safe transaction #${tx.nonce} (${tx.label}): ${hash}`);
      return;
    }

    case "status": {
      const content = JSON.parse(readFileSync(fileArg, "utf8"));
      if (content.safeTxHash) {
        const status = await safeTxStatus(provider, content);
        console.log(`Safe tx #${content.nonce} ${content.label}`);
        console.log(`  executed: ${status.executed} · approvals ${status.approved.length}/${status.threshold}`);
        status.approved.forEach((owner) => console.log("   ✓", owner));
      } else {
        const timelock = new ethers.Contract(content.timelock, TIMELOCK_ABI, provider);
        const readyAt = await timelock.getTimestamp(content.id);
        console.log(`Timelock op ${content.label}`);
        console.log(
          readyAt === 0n
            ? "  not scheduled"
            : (await timelock.isOperationDone(content.id))
              ? "  done"
              : `  scheduled, ready at ${new Date(Number(readyAt) * 1000).toISOString()} (${(await timelock.isOperationReady(content.id)) ? "ready now" : "waiting"})`,
        );
      }
      return;
    }

    default:
      throw new Error("Unknown command. See the header of contracts/multisig.js.");
  }
}

main().catch((error) => {
  console.error("multisig:", error.shortMessage ?? error.message ?? error);
  process.exit(1);
});
