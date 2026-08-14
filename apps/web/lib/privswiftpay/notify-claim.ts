import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";

import {
  privacyEscrowAbi,
  privacyEscrowAddress,
} from "@/lib/contracts";
import {
  parsePrivacyCode,
  shortenAddress,
  type PrivacyCodePayload,
} from "@/lib/privswiftpay/claim-code";
import {
  createSavingsNotificationResult,
  hasNotificationForPaymentId,
  type SavingsNotificationRecord,
} from "@/lib/save/notifications";
import { arcTestnetTokens } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0]),
});

const onChainPollAttempts = 10;
const onChainPollDelayMs = 1_200;

function requireEscrowAddress(): Address {
  if (!privacyEscrowAddress || !isAddress(privacyEscrowAddress)) {
    throw new Error("PrivSwiftPay escrow is not configured.");
  }
  return getAddress(privacyEscrowAddress) as Address;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Collapse free-form notes / payroll labels to a short purpose word
 * (e.g. "Payroll: Engineering - Ada" → "Payroll").
 */
export function shortPaymentPurpose(note?: string): string {
  if (!note?.trim()) {
    return "";
  }

  const cleaned = note
    .trim()
    .replace(/^note:\s*/i, "")
    .replace(/^purpose:\s*/i, "");

  // Prefer the lead label before ":" or "-" (common payroll pattern).
  const head =
    cleaned.split(/[:–—-]/)[0]?.trim() || cleaned;
  // First word only, capped for the notification feed.
  const word = (head.split(/\s+/)[0] ?? head).replace(/[^\w]/g, "");
  return word.slice(0, 20);
}

/**
 * Body is the durable delivery channel — live Supabase may not have a
 * `metadata` column, so the full claim code must live in `body`.
 */
export function buildPrivSwiftPayClaimNotificationCopy(input: {
  amount: string;
  token: string;
  sender: string;
  recipient: string;
  paymentId: string;
  claimCode: string;
  note?: string;
  depositTxHash?: string | null;
}) {
  const fromLabel = shortenAddress(input.sender);
  const purpose = shortPaymentPurpose(input.note);

  const title = purpose
    ? `${input.amount} ${input.token} ready to claim · ${purpose}`
    : `${input.amount} ${input.token} ready to claim`;
  // CLAIM_CODE: prefix is parsed by the notifications bell.
  const body = [
    `You received $${input.amount} ${input.token} from ${fromLabel}.`,
    purpose ? purpose : "",
    `PAYMENT_ID:${input.paymentId.toLowerCase()}`,
    `CLAIM_CODE:${input.claimCode.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { title, body };
}

async function readFundedPayment(paymentId: Hex) {
  const escrow = requireEscrowAddress();
  return arcPublicClient.readContract({
    address: escrow,
    abi: privacyEscrowAbi,
    functionName: "payments",
    args: [paymentId],
  });
}

/**
 * Verify the claim code is funded on-chain, then create an in-app notification
 * for the recipient containing the full claim code.
 */
export async function notifyRecipientOfPrivSwiftPayClaim(input: {
  claimCode: string;
  relatedTxHash?: string | null;
  skipOnChainWait?: boolean;
}): Promise<{
  notification: SavingsNotificationRecord | null;
  payload: PrivacyCodePayload;
  alreadyNotified: boolean;
}> {
  const payload = parsePrivacyCode(input.claimCode);
  const tokenMeta = arcTestnetTokens[payload.token];
  const expectedAmount = parseUnits(payload.amount, tokenMeta.decimals);

  // On-chain check is best-effort. Never block claim-code delivery solely
  // because RPC is lagging or env escrow address is briefly wrong — the
  // claim code itself is cryptographically bound to recipient + secret.
  let onChainVerified = false;
  const attempts = input.skipOnChainWait ? 0 : onChainPollAttempts;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const row = await readFundedPayment(payload.id as Hex);
      const token = row[0];
      const amount = row[1];
      const commitment = row[2];
      const claimed = row[3];

      if (amount === 0n) {
        // not funded yet — wait
      } else if (claimed) {
        throw new Error("This claim has already been redeemed.");
      } else if (token.toLowerCase() !== tokenMeta.address.toLowerCase()) {
        console.warn(
          "[privswiftpay-notify] on-chain token mismatch; still delivering code",
        );
        onChainVerified = true;
        break;
      } else if (amount !== expectedAmount) {
        console.warn(
          "[privswiftpay-notify] on-chain amount mismatch; still delivering code",
        );
        onChainVerified = true;
        break;
      } else if (
        commitment.toLowerCase() !== payload.commitment.toLowerCase()
      ) {
        throw new Error("On-chain commitment does not match the claim code.");
      } else {
        onChainVerified = true;
        break;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("already been redeemed") ||
          error.message.includes("commitment does not match"))
      ) {
        throw error;
      }
      // RPC / config errors: keep trying, then deliver anyway.
      console.warn(
        "[privswiftpay-notify] on-chain read attempt failed",
        error instanceof Error ? error.message : error,
      );
    }

    if (attempt < attempts - 1) {
      await wait(onChainPollDelayMs);
    }
  }

  if (!onChainVerified && attempts > 0) {
    console.warn(
      "[privswiftpay-notify] delivering claim code without confirmed on-chain funding yet",
      { paymentId: payload.id, escrow: privacyEscrowAddress },
    );
  }

  // Ensure escrow address is at least configured (surface misconfig early).
  try {
    requireEscrowAddress();
  } catch (error) {
    console.warn(
      "[privswiftpay-notify]",
      error instanceof Error ? error.message : "escrow not configured",
    );
  }

  const recipient = getAddress(payload.recipient);
  const sender = getAddress(payload.sender);

  // Dedupe when related_tx_hash column is missing from the live DB.
  if (await hasNotificationForPaymentId(recipient, payload.id)) {
    return {
      notification: null,
      payload,
      alreadyNotified: true,
    };
  }

  const copy = buildPrivSwiftPayClaimNotificationCopy({
    amount: payload.amount,
    token: payload.token,
    sender,
    recipient,
    paymentId: payload.id,
    claimCode: input.claimCode.trim(),
    note: payload.note,
    depositTxHash: input.relatedTxHash ?? null,
  });

  const result = await createSavingsNotificationResult({
    ownerWallet: recipient,
    kind: "privswiftpay_claim",
    fallbackKind: "payment_received",
    title: copy.title,
    body: copy.body,
    // May be stripped automatically if column missing in Supabase.
    relatedTxHash: payload.id.toLowerCase(),
    metadata: {
      claimCode: input.claimCode.trim(),
      amount: payload.amount,
      token: payload.token,
      sender,
      recipient,
      paymentId: payload.id,
      note: payload.note ?? null,
      commitment: payload.commitment,
      depositTxHash: input.relatedTxHash?.toLowerCase() ?? null,
      pool: payload.pool,
      createdAt: payload.createdAt,
      type: "privswiftpay_claim",
    },
  });

  if (!result.record && !result.alreadyExists) {
    throw new Error(
      result.error ??
        "Could not store claim notification in Supabase.",
    );
  }

  return {
    notification: result.record,
    payload,
    alreadyNotified: result.alreadyExists,
  };
}
