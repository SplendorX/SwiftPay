const circleBaseUrl =
  process.env.CIRCLE_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_CIRCLE_BASE_URL?.trim() ||
  "https://api.circle.com";

/** Server-side call to Circle's user-controlled wallets API. */
export async function circleRequest(
  path: string,
  init: { body?: Record<string, unknown>; method: "GET" | "POST"; userToken?: string },
) {
  const apiKey = process.env.CIRCLE_API_KEY || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY;
  if (!apiKey) {
    throw new Error("Missing CIRCLE_API_KEY for Circle user wallets.");
  }
  const response = await fetch(new URL(path, circleBaseUrl), {
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.userToken ? { "X-User-Token": init.userToken } : {}),
    },
    method: init.method,
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text };
  }
  return { body, status: response.status };
}

/**
 * Lowercased addresses of the wallets a Circle user token controls. Circle
 * only answers for a live token, so a match proves wallet ownership.
 */
export async function listWalletAddressesForUserToken(userToken: string) {
  const wallets = await circleRequest("/v1/w3s/wallets", { method: "GET", userToken });
  if (wallets.status >= 400) {
    return [];
  }
  const list = (wallets.body.data as { wallets?: Array<{ address?: string }> } | undefined)
    ?.wallets;
  return (list ?? [])
    .map((wallet) => wallet.address?.toLowerCase())
    .filter((address): address is string => Boolean(address));
}
