import crypto from "node:crypto";

/**
 * Verifies a Circle webhook the way Circle signs them: an ECDSA (SHA-256)
 * signature over the raw body in `X-Circle-Signature`, checked against the
 * public key Circle publishes for `X-Circle-Key-Id`
 * (GET /v2/notifications/publicKey/{id}). No shared secret is involved, so
 * nothing on our side can leak that would let someone forge a notification.
 */

type CachedKey = { algorithm: string; key: crypto.KeyObject };

// Circle rotates keys rarely and each id is immutable, so ids can be cached
// for the life of the process.
const keyCache = new Map<string, Promise<CachedKey | null>>();

function circleApiBase() {
  return (process.env.CIRCLE_BASE_URL?.trim() || "https://api.circle.com").replace(/\/$/, "");
}

async function fetchPublicKey(keyId: string): Promise<CachedKey | null> {
  const apiKey =
    process.env.CIRCLE_API_KEY?.trim() || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY?.trim();
  if (!apiKey) return null;

  const response = await fetch(
    `${circleApiBase()}/v2/notifications/publicKey/${encodeURIComponent(keyId)}`,
    { cache: "no-store", headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as {
    data?: { algorithm?: string; publicKey?: string };
  } | null;
  const publicKey = payload?.data?.publicKey;
  if (!publicKey) return null;

  const key = publicKey.includes("BEGIN")
    ? crypto.createPublicKey(publicKey)
    : crypto.createPublicKey({ format: "der", key: Buffer.from(publicKey, "base64"), type: "spki" });
  return { algorithm: payload?.data?.algorithm ?? "", key };
}

function publicKeyFor(keyId: string) {
  let cached = keyCache.get(keyId);
  if (!cached) {
    cached = fetchPublicKey(keyId).catch(() => null);
    keyCache.set(keyId, cached);
    // Don't pin a failed lookup; let the next webhook try again.
    void cached.then((value) => {
      if (!value) keyCache.delete(keyId);
    });
  }
  return cached;
}

export async function verifyCircleWebhook(rawBody: string, headers: Headers): Promise<boolean> {
  const signature = headers.get("x-circle-signature")?.trim();
  const keyId = headers.get("x-circle-key-id")?.trim();

  if (!signature || !keyId || !/^[A-Za-z0-9-]{8,64}$/.test(keyId)) {
    // Unsigned test calls are only accepted by a local `next dev`.
    return process.env.NODE_ENV === "development" && !signature && !keyId;
  }

  const publicKey = await publicKeyFor(keyId);
  if (!publicKey) return false;
  if (publicKey.algorithm && !/ECDSA.*SHA.?256/i.test(publicKey.algorithm)) return false;

  try {
    return crypto.verify(
      "sha256",
      Buffer.from(rawBody, "utf8"),
      publicKey.key,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}
