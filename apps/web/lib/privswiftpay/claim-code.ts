import {
  encodePacked,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  type Address,
  type Hex,
} from "viem";

import { arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";

export const PRIVSWIFTPAY_CODE_PREFIX = "privswiftpay:";

export type PrivacyCodePayload = {
  amount: string;
  chainId: number;
  commitment: string;
  createdAt: string;
  id: string;
  kind: "privswiftpay.payment";
  network: string;
  note?: string;
  pool: "swiftpay-privacy-pool";
  recipient: string;
  secret: string;
  sender: string;
  token: ArcTokenSymbol;
  version: 1;
};

function isBytes32Hex(value: unknown): value is Hex {
  return typeof value === "string" && value.length === 66 && isHex(value);
}

function isPositiveAmount(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return false;
  }
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

function encodeBase64Url(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export function buildCommitment(
  paymentId: Hex,
  secret: Hex,
  recipient: Address,
) {
  return keccak256(
    encodePacked(
      ["bytes32", "bytes32", "address"],
      [paymentId, secret, recipient],
    ),
  );
}

export function isPrivacyCodePayload(
  value: unknown,
): value is PrivacyCodePayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<PrivacyCodePayload>;

  return (
    payload.kind === "privswiftpay.payment" &&
    payload.version === 1 &&
    typeof payload.id === "string" &&
    typeof payload.sender === "string" &&
    typeof payload.recipient === "string" &&
    typeof payload.amount === "string" &&
    isBytes32Hex(payload.id) &&
    isBytes32Hex(payload.secret) &&
    isBytes32Hex(payload.commitment) &&
    typeof payload.createdAt === "string" &&
    arcTokenSymbols.includes(payload.token as ArcTokenSymbol) &&
    isAddress(payload.sender) &&
    isAddress(payload.recipient) &&
    isPositiveAmount(payload.amount)
  );
}

export function encodePrivacyCode(payload: PrivacyCodePayload) {
  return `${PRIVSWIFTPAY_CODE_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}

export function parsePrivacyCode(code: string): PrivacyCodePayload {
  const cleaned = code.trim().replace(/^privswiftpay:/i, "");

  if (!cleaned) {
    throw new Error("Paste a payment claim code.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(cleaned)) as unknown;
  } catch {
    throw new Error("This is not a valid privSwiftPay claim code.");
  }

  if (!isPrivacyCodePayload(parsed)) {
    throw new Error("This is not a valid privSwiftPay claim code.");
  }

  // Ensure commitment binds secret to intended recipient.
  const expected = buildCommitment(
    parsed.id as Hex,
    parsed.secret as Hex,
    getAddress(parsed.recipient) as Address,
  );
  if (expected.toLowerCase() !== parsed.commitment.toLowerCase()) {
    throw new Error("Claim code commitment is invalid.");
  }

  return parsed;
}

export function shortenAddress(value: string) {
  if (!isAddress(value)) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
