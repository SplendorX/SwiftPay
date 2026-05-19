import { NextResponse, type NextRequest } from "next/server";
import { request as httpsRequest } from "node:https";

const circleApiOrigin = "https://api.circle.com";
const allowedPaths = new Set([
  "/v1/stablecoinKits/swap",
  "/v1/stablecoinKits/swap/status",
]);

export const runtime = "nodejs";

type CircleProxyResponse = {
  body: unknown;
  contentType: string;
  status: number;
};

function getCircleKitKey() {
  return process.env.KIT_KEY ?? process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY;
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

function requestCircleWithLocalTlsFallback(
  targetUrl: URL,
  method: string,
  body: string | undefined,
  kitKey: string,
): Promise<CircleProxyResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      targetUrl,
      {
        headers: {
          Authorization: `Bearer ${kitKey}`,
          "Content-Type": "application/json",
        },
        method,
        rejectUnauthorized: false,
      },
      (response) => {
        let rawBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          const contentType = String(response.headers["content-type"] ?? "");

          resolve({
            body: parseBody(rawBody, contentType),
            contentType,
            status: response.statusCode ?? 502,
          });
        });
      },
    );

    request.on("error", reject);

    if (method !== "GET" && body) {
      request.write(body);
    }

    request.end();
  });
}

async function requestCircle(
  targetUrl: URL,
  method: string,
  body: string | undefined,
  kitKey: string,
) {
  try {
    return await requestCircleWithSystemTls(targetUrl, method, body, kitKey);
  } catch (error) {
    if (!isNodeCertificateError(error)) {
      throw error;
    }

    return requestCircleWithLocalTlsFallback(targetUrl, method, body, kitKey);
  }
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
      { message: "Missing Circle KIT_KEY for swaps." },
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
  } catch {
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
