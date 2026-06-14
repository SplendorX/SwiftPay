import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";

const circleBaseUrl =
  process.env.CIRCLE_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_CIRCLE_BASE_URL?.trim() ||
  "https://api.circle.com";
const circleApiKey = process.env.CIRCLE_API_KEY;

export const runtime = "nodejs";

type CircleAction =
  | "createTransfer"
  | "createContractExecution"
  | "createDeviceToken"
  | "getEntityConfig"
  | "getChallenge"
  | "getTransaction"
  | "getTokenBalance"
  | "initializeUser"
  | "listTransactions"
  | "listWallets";

type CircleActionBody = {
  action?: CircleAction;
  amount?: string;
  blockchain?: string;
  callData?: string;
  contractAddress?: string;
  destinationAddress?: string;
  deviceId?: string;
  feeLevel?: "HIGH" | "LOW" | "MEDIUM";
  challengeId?: string;
  pageSize?: number;
  refId?: string;
  tokenAddress?: string;
  tokenId?: string;
  transactionId?: string;
  txHash?: string;
  txType?: "INBOUND" | "OUTBOUND";
  userToken?: string;
  walletId?: string;
  walletIds?: string[];
};

type CircleWalletApiResponse = {
  body: Record<string, unknown>;
  status: number;
};

function missingParameter(name: string) {
  return NextResponse.json(
    { message: `Missing ${name}.` },
    { status: 400 },
  );
}

function missingApiKey() {
  return NextResponse.json(
    { message: "Missing CIRCLE_API_KEY for Circle user wallets." },
    { status: 500 },
  );
}

async function readCircleJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

function parseCircleText(text: string) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

function isNodeCertificateError(error: unknown) {
  return (
    error instanceof TypeError &&
    error.message === "fetch failed" &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    error.cause.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  );
}

function getRequestFailureReason(error: unknown) {
  if (error instanceof Error) {
    const cause =
      typeof error.cause === "object" &&
      error.cause !== null &&
      "code" in error.cause
        ? ` (${String(error.cause.code)})`
        : "";

    return `${error.message}${cause}`;
  }

  return "unknown request error";
}

function isRetryableNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const causeCode =
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause
      ? String(error.cause.code)
      : "";

  return (
    message.includes("socket hang up") ||
    causeCode === "ECONNRESET" ||
    causeCode === "ETIMEDOUT"
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function requestCircleWithSystemTls(
  targetUrl: URL,
  options: {
    body?: Record<string, unknown>;
    method: "GET" | "POST";
    userToken?: string;
  },
) {
  const response = await fetch(targetUrl, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${circleApiKey}`,
      Connection: "close",
      "content-type": "application/json",
      ...(options.userToken ? { "X-User-Token": options.userToken } : {}),
    },
    method: options.method,
  });
  const payload = await readCircleJson(response);

  return {
    body: (payload.data ?? payload) as Record<string, unknown>,
    status: response.status,
  } satisfies CircleWalletApiResponse;
}

function requestCircleWithLocalTlsFallback(
  targetUrl: URL,
  options: {
    body?: Record<string, unknown>;
    method: "GET" | "POST";
    userToken?: string;
  },
) {
  return new Promise<CircleWalletApiResponse>((resolve, reject) => {
    const request = httpsRequest(
      targetUrl,
      {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${circleApiKey}`,
          Connection: "close",
          "content-type": "application/json",
          ...(options.userToken ? { "X-User-Token": options.userToken } : {}),
        },
        method: options.method,
        rejectUnauthorized: false,
      },
      (response) => {
        let rawBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          const payload = parseCircleText(rawBody);

          resolve({
            body: (payload.data ?? payload) as Record<string, unknown>,
            status: response.statusCode ?? 502,
          });
        });
      },
    );

    request.on("error", reject);

    if (options.body) {
      request.write(JSON.stringify(options.body));
    }

    request.end();
  });
}

async function requestCircleApi(
  targetUrl: URL,
  options: {
    body?: Record<string, unknown>;
    method: "GET" | "POST";
    userToken?: string;
  },
) {
  async function requestWithLocalFallback() {
    try {
      return await requestCircleWithSystemTls(targetUrl, options);
    } catch (error) {
      if (!isNodeCertificateError(error)) {
        throw error;
      }

      return requestCircleWithLocalTlsFallback(targetUrl, options);
    }
  }

  try {
    return await requestWithLocalFallback();
  } catch (error) {
    if (isRetryableNetworkError(error)) {
      await wait(300);
      return requestWithLocalFallback();
    }

    throw error;
  }
}

async function requestCircle(
  path: string,
  options: {
    body?: Record<string, unknown>;
    method: "GET" | "POST";
    userToken?: string;
  },
) {
  if (!circleApiKey) {
    return missingApiKey();
  }

  try {
    const response = await requestCircleApi(new URL(path, circleBaseUrl), options);

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    const reason = getRequestFailureReason(error);
    console.error("Circle user wallet request failed:", reason);

    return NextResponse.json(
      {
        message:
          `Circle user wallet service could not be reached: ${reason}. Check CIRCLE_API_KEY, CIRCLE_BASE_URL, and local network access.`,
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  let body: CircleActionBody;

  try {
    body = (await request.json()) as CircleActionBody;
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  switch (body.action) {
    case "getEntityConfig": {
      return requestCircle("/v1/w3s/config/entity", {
        method: "GET",
      });
    }

    case "createDeviceToken": {
      if (!body.deviceId) {
        return missingParameter("deviceId");
      }

      return requestCircle("/v1/w3s/users/social/token", {
        body: {
          deviceId: body.deviceId,
          idempotencyKey: crypto.randomUUID(),
        },
        method: "POST",
      });
    }

    case "initializeUser": {
      if (!body.userToken) {
        return missingParameter("userToken");
      }

      return requestCircle("/v1/w3s/user/initialize", {
        body: {
          accountType: "SCA",
          blockchains: ["ARC-TESTNET"],
          idempotencyKey: crypto.randomUUID(),
        },
        method: "POST",
        userToken: body.userToken,
      });
    }

    case "listWallets": {
      if (!body.userToken) {
        return missingParameter("userToken");
      }

      return requestCircle("/v1/w3s/wallets", {
        method: "GET",
        userToken: body.userToken,
      });
    }

    case "getTokenBalance": {
      if (!body.userToken) {
        return missingParameter("userToken");
      }

      if (!body.walletId) {
        return missingParameter("walletId");
      }

      return requestCircle(`/v1/w3s/wallets/${body.walletId}/balances`, {
        method: "GET",
        userToken: body.userToken,
      });
    }

    case "getTransaction": {
      if (!body.userToken) {
        return missingParameter("userToken");
      }

      if (!body.transactionId) {
        return missingParameter("transactionId");
      }

      return requestCircle(`/v1/w3s/transactions/${body.transactionId}`, {
        method: "GET",
        userToken: body.userToken,
      });
    }

    case "getChallenge": {
      if (!body.userToken) {
        return missingParameter("userToken");
      }

      if (!body.challengeId) {
        return missingParameter("challengeId");
      }

      return requestCircle(`/v1/w3s/user/challenges/${body.challengeId}`, {
        method: "GET",
        userToken: body.userToken,
      });
    }

    case "listTransactions": {
      if (!body.userToken) {
        return missingParameter("userToken");
      }

      const query = new URLSearchParams();
      const walletIds =
        body.walletIds && body.walletIds.length > 0
          ? body.walletIds
          : body.walletId
            ? [body.walletId]
            : [];
      const pageSize = Math.min(Math.max(body.pageSize ?? 20, 1), 50);

      query.set("includeAll", "true");
      query.set("order", "DESC");
      query.set("pageSize", String(pageSize));

      if (walletIds.length > 0) {
        query.set("walletIds", walletIds.join(","));
      }

      if (body.txType) {
        query.set("txType", body.txType);
      }

      if (body.txHash) {
        query.set("txHash", body.txHash);
      }

      return requestCircle(`/v1/w3s/transactions?${query.toString()}`, {
        method: "GET",
        userToken: body.userToken,
      });
    }

    case "createTransfer": {
      if (!body.userToken) {
        return missingParameter("userToken");
      }

      if (!body.walletId) {
        return missingParameter("walletId");
      }

      if (!body.destinationAddress) {
        return missingParameter("destinationAddress");
      }

      if (!body.amount) {
        return missingParameter("amount");
      }

      if (!body.tokenId && (!body.tokenAddress || !body.blockchain)) {
        return NextResponse.json(
          { message: "Missing tokenId or tokenAddress and blockchain." },
          { status: 400 },
        );
      }

      return requestCircle("/v1/w3s/user/transactions/transfer", {
        body: {
          amounts: [body.amount],
          destinationAddress: body.destinationAddress,
          feeLevel: body.feeLevel ?? "MEDIUM",
          idempotencyKey: crypto.randomUUID(),
          refId: body.refId,
          tokenAddress: body.tokenId ? undefined : body.tokenAddress,
          tokenId: body.tokenId,
          blockchain: body.tokenId ? undefined : body.blockchain,
          walletId: body.walletId,
        },
        method: "POST",
        userToken: body.userToken,
      });
    }

    case "createContractExecution": {
      if (!body.userToken) {
        return missingParameter("userToken");
      }

      if (!body.walletId) {
        return missingParameter("walletId");
      }

      if (!body.contractAddress) {
        return missingParameter("contractAddress");
      }

      if (!body.callData) {
        return missingParameter("callData");
      }

      return requestCircle("/v1/w3s/user/transactions/contractExecution", {
        body: {
          amount: body.amount,
          callData: body.callData,
          contractAddress: body.contractAddress,
          feeLevel: body.feeLevel ?? "MEDIUM",
          idempotencyKey: crypto.randomUUID(),
          refId: body.refId,
          walletId: body.walletId,
        },
        method: "POST",
        userToken: body.userToken,
      });
    }

    default:
      return NextResponse.json(
        { message: "Unknown Circle wallet action." },
        { status: 400 },
      );
  }
}
