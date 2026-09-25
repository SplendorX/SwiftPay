/**
 * Minimal Safe (v1.4.1) client: create a Safe, and propose, approve and
 * execute transactions with on-chain approvals.
 *
 * On-chain approvals (`approveHash`) work from any wallet that can send a
 * contract call — hardware wallet, MetaMask, a block explorer's write tab — so
 * signers don't depend on the Safe web app supporting Arc.
 *
 * Addresses are Safe's canonical deployments, identical on every chain that
 * has them (verified present on Arc testnet).
 */
import { ethers } from "ethers";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SAFE_ADDRESSES = {
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  singletonL2: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
};

const SAFE_ABI = [
  "function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function approvedHashes(address owner, bytes32 hash) view returns (uint256)",
  "function approveHash(bytes32 hash)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
  "event ExecutionSuccess(bytes32 txHash, uint256 payment)",
  "event ExecutionFailure(bytes32 txHash, uint256 payment)",
];

const FACTORY_ABI = [
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "event ProxyCreation(address indexed proxy, address singleton)",
];

const ZERO = ethers.ZeroAddress;
const txDir = join(dirname(fileURLToPath(import.meta.url)), "../../deployments/safe-txs");

export async function assertSafeDeployed(provider) {
  for (const [name, address] of Object.entries(SAFE_ADDRESSES)) {
    const code = await provider.getCode(address);
    if (!code || code === "0x") {
      throw new Error(`Safe ${name} (${address}) is not deployed on this network.`);
    }
  }
}

/** Deploy a new Safe proxy with `owners` and `threshold`. Returns its address. */
export async function createSafe(signer, owners, threshold, saltNonce = BigInt(Date.now())) {
  await assertSafeDeployed(signer.provider);
  const singleton = new ethers.Interface(SAFE_ABI);
  const initializer = singleton.encodeFunctionData("setup", [
    owners,
    threshold,
    ZERO,
    "0x",
    SAFE_ADDRESSES.fallbackHandler,
    ZERO,
    0,
    ZERO,
  ]);
  const factory = new ethers.Contract(SAFE_ADDRESSES.proxyFactory, FACTORY_ABI, signer);
  const tx = await factory.createProxyWithNonce(SAFE_ADDRESSES.singletonL2, initializer, saltNonce);
  const receipt = await tx.wait();
  const created = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "ProxyCreation");
  if (!created) throw new Error("Safe creation emitted no ProxyCreation event.");
  return { address: created.args.proxy, txHash: tx.hash };
}

export function safeContract(address, runner) {
  return new ethers.Contract(address, SAFE_ABI, runner);
}

/**
 * Record a Safe transaction for the Safe's current nonce. Every signer
 * approves the same `safeTxHash`; the file is what gets passed around.
 */
export async function proposeSafeTx(provider, safeAddress, { to, data, value = 0n, label }) {
  const safe = safeContract(safeAddress, provider);
  const nonce = await safe.nonce();
  const tx = {
    baseGas: "0",
    data,
    gasPrice: "0",
    gasToken: ZERO,
    label: label ?? "",
    nonce: nonce.toString(),
    operation: 0,
    refundReceiver: ZERO,
    safe: ethers.getAddress(safeAddress),
    safeTxGas: "0",
    to: ethers.getAddress(to),
    value: value.toString(),
  };
  tx.safeTxHash = await safe.getTransactionHash(
    tx.to, tx.value, tx.data, tx.operation, tx.safeTxGas, tx.baseGas, tx.gasPrice,
    tx.gasToken, tx.refundReceiver, tx.nonce,
  );

  mkdirSync(txDir, { recursive: true });
  const file = join(txDir, `${tx.safe.slice(0, 10)}-nonce-${tx.nonce}.json`);
  writeFileSync(file, JSON.stringify(tx, null, 2));
  return { file, tx };
}

export function readSafeTx(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Approve a proposed transaction from one owner's wallet. */
export async function approveSafeTx(signer, tx) {
  const safe = safeContract(tx.safe, signer);
  const owners = (await safe.getOwners()).map((owner) => owner.toLowerCase());
  if (!owners.includes(signer.address.toLowerCase())) {
    throw new Error(`${signer.address} is not an owner of ${tx.safe}.`);
  }
  if ((await safe.nonce()) > BigInt(tx.nonce)) {
    throw new Error("This Safe transaction was already executed; nothing to approve.");
  }
  if ((await safe.approvedHashes(signer.address, tx.safeTxHash)) !== 0n) {
    return null;
  }
  const sent = await safe.approveHash(tx.safeTxHash);
  await sent.wait();
  return sent.hash;
}

/** Who has approved, and whether the threshold is met. */
export async function safeTxStatus(provider, tx, executor) {
  const safe = safeContract(tx.safe, provider);
  const [owners, threshold, nonce] = await Promise.all([
    safe.getOwners(),
    safe.getThreshold(),
    safe.nonce(),
  ]);
  const approved = [];
  for (const owner of owners) {
    const isExecutor = executor && owner.toLowerCase() === executor.toLowerCase();
    if (isExecutor || (await safe.approvedHashes(owner, tx.safeTxHash)) !== 0n) {
      approved.push(owner);
    }
  }
  return {
    approved,
    executed: nonce > BigInt(tx.nonce),
    owners,
    ready: BigInt(approved.length) >= threshold && nonce === BigInt(tx.nonce),
    threshold,
  };
}

/**
 * Execute once enough owners approved. Any account can send it; when the
 * sender is itself an owner, sending counts as that owner's approval.
 */
export async function executeSafeTx(signer, tx) {
  const status = await safeTxStatus(signer.provider, tx, signer.address);
  if (status.executed) throw new Error("This Safe transaction was already executed.");
  if (!status.ready) {
    throw new Error(
      `Needs ${status.threshold} approvals, has ${status.approved.length}: ${status.approved.join(", ") || "none"}.`,
    );
  }

  // Pre-approved signatures (v = 1), sorted by owner address as Safe requires.
  const signatures = ethers.concat(
    [...status.approved]
      .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))
      .slice(0, Number(status.threshold))
      .map((owner) =>
        ethers.concat([ethers.zeroPadValue(owner, 32), ethers.ZeroHash, "0x01"]),
      ),
  );

  const safe = safeContract(tx.safe, signer);
  const sent = await safe.execTransaction(
    tx.to, tx.value, tx.data, tx.operation, tx.safeTxGas, tx.baseGas, tx.gasPrice,
    tx.gasToken, tx.refundReceiver, signatures,
  );
  const receipt = await sent.wait();
  const failed = receipt.logs.some((log) => {
    try {
      return safe.interface.parseLog(log)?.name === "ExecutionFailure";
    } catch {
      return false;
    }
  });
  if (failed) {
    throw new Error(`Safe executed, but the inner call reverted (${sent.hash}).`);
  }
  return sent.hash;
}
