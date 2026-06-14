import { NextResponse, type NextRequest } from "next/server";
import {
  Agent,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from "undici";

const circleApiOrigin = "https://api.circle.com";
const allowedPaths = new Set([
  "/v1/stablecoinKits/quote",
  "/v1/stablecoinKits/swap",
  "/v1/stablecoinKits/swap/status",
]);
const circleRequestAttempts = 3;
const circleRetryDelayMs = 500;

export const runtime = "nodejs";

type CircleProxyResponse = {
  body: unknown;
  contentType: string;
  status: number;
};

type FetchInitWithDispatcher = UndiciRequestInit & {
  dispatcher: Agent;
};

function getCircleKitKey() {
  return process.env.KIT_KEY ?? process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY;
}

function getErrorCauseCode(error: unknown) {
  if (
    error instanceof Error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    typeof error.cause.code === "string"
  ) {
    return error.cause.code;
  }

  return undefined;
}

function isRetryableNodeFetchError(error: unknown) {
  const retryableCauseCodes = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "UND_ERR_SOCKET",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  ]);

  return (
    error instanceof TypeError &&
    error.message === "fetch failed" &&
    retryableCauseCodes.has(getErrorCauseCode(error) ?? "")
  );
}

function parseBody(rawBody: string, contentType: string) {
  if (!contentType.includes("application/json")) {
    return rawBody;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getLoggableErrorDetails(error: unknown) {
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? error.cause
      : undefined;

  return {
    causeCode: getErrorCauseCode(error),
    causeMessage: cause?.message,
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : typeof error,
  };
}

async function requestCircleWithSystemTls(
  targetUrl: URL,
  method: string,
  body: string | undefined,
  kitKey: string,
): Promise<CircleProxyResponse> {
  const response = await fetch(targetUrl, {
    body: method === "GET" ? undefined : body,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${kitKey}`,
      "Content-Type": "application/json",
    },
    method,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();

  return {
    body: parseBody(rawBody, contentType),
    contentType,
    status: response.status,
  };
}

async function requestCircleWithLocalTlsFallback(
  targetUrl: URL,
  method: string,
  body: string | undefined,
  kitKey: string,
) {
  const localTlsDispatcher = new Agent({
    connect: {
      rejectUnauthorized: false,
    },
  });
  const init: FetchInitWithDispatcher = {
    body: method === "GET" ? undefined : body,
    dispatcher: localTlsDispatcher,
    headers: {
      Authorization: `Bearer ${kitKey}`,
      "Content-Type": "application/json",
    },
    method,
  };

  try {
    const response = await undiciFetch(targetUrl.toString(), init);
    const contentType = response.headers.get("content-type") ?? "";
    const rawBody = await response.text();

    return {
      body: parseBody(rawBody, contentType),
      contentType,
      status: response.status,
    };
  } finally {
    await localTlsDispatcher.close();
  }
}

async function requestCircle(
  targetUrl: URL,
  method: string,
  body: string | undefined,
  kitKey: string,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= circleRequestAttempts; attempt += 1) {
    try {
      return await requestCircleWithSystemTls(targetUrl, method, body, kitKey);
    } catch (systemError) {
      if (!isRetryableNodeFetchError(systemError)) {
        throw systemError;
      }

      try {
        return await requestCircleWithLocalTlsFallback(
          targetUrl,
          method,
          body,
          kitKey,
        );
      } catch (fallbackError) {
        lastError = fallbackError;

        if (
          !isRetryableNodeFetchError(fallbackError) ||
          attempt === circleRequestAttempts
        ) {
          throw fallbackError;
        }

        await wait(circleRetryDelayMs * attempt);
      }
    }
  }

  throw lastError;
}

async function proxyCircleRequest(request: NextRequest) {
  const path = `/${request.nextUrl.pathname
    .replace(/^\/api\/circle\/?/, "")
    .replace(/^\/+/, "")}`;

  if (!allowedPaths.has(path)) {
    return NextResponse.json(
      { message: "Circle endpoint is not allowed." },
      { status: 404 },
    );
  }

  const kitKey = getCircleKitKey();

  if (!kitKey) {
    return NextResponse.json(
      { message: "Missing Circle KIT_KEY for Circle App Kit routes." },
      { status: 500 },
    );
  }

  const targetUrl = new URL(path, circleApiOrigin);
  targetUrl.search = request.nextUrl.search;

  try {
    const response = await requestCircle(
      targetUrl,
      request.method,
      request.method === "GET" ? undefined : await request.text(),
      kitKey,
    );

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    console.error("Circle proxy request failed", {
      path,
      ...getLoggableErrorDetails(error),
    });

    return NextResponse.json(
      {
        message:
          "Circle swap service could not be reached. Check your network and KIT_KEY, then try again.",
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  return proxyCircleRequest(request);
}

export async function POST(request: NextRequest) {
  return proxyCircleRequest(request);
}
