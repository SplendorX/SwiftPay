import { createClient } from "@supabase/supabase-js";
import https from "node:https";

function isLeafSignatureError(error: unknown) {
  return (
    error instanceof Error &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    error.cause.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  );
}

function getRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (input instanceof Request) {
    return input.url;
  }

  return input.toString();
}

function getRequestMethod(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
) {
  if (init?.method) {
    return init.method;
  }

  if (input instanceof Request) {
    return input.method;
  }

  return "GET";
}

function getRequestHeaders(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
) {
  const headers = new Headers(input instanceof Request ? input.headers : {});

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return Object.fromEntries(headers.entries());
}

async function getRequestBody(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
) {
  const body = init?.body;

  if (body !== undefined && body !== null) {
    return body;
  }

  if (input instanceof Request && input.body) {
    return input.clone().arrayBuffer();
  }

  return undefined;
}

function writeRequestBody(
  request: ReturnType<typeof https.request>,
  body: Awaited<ReturnType<typeof getRequestBody>>,
) {
  if (body === undefined || body === null) {
    return;
  }

  if (typeof body === "string") {
    request.write(body);
    return;
  }

  if (body instanceof URLSearchParams) {
    request.write(body.toString());
    return;
  }

  if (body instanceof ArrayBuffer) {
    request.write(Buffer.from(body));
    return;
  }

  if (body instanceof Uint8Array) {
    request.write(body);
  }
}

async function fetchWithRelaxedTls(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
) {
  const url = new URL(getRequestUrl(input));
  const body = await getRequestBody(input, init);

  return new Promise<Response>((resolve, reject) => {
    const request = https.request(
      url,
      {
        headers: getRequestHeaders(input, init),
        method: getRequestMethod(input, init),
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          const responseHeaders = new Headers();

          Object.entries(response.headers).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              value.forEach((item) => responseHeaders.append(key, item));
              return;
            }

            if (value !== undefined) {
              responseHeaders.set(key, value);
            }
          });

          resolve(
            new Response(Buffer.concat(chunks), {
              headers: responseHeaders,
              status: response.statusCode ?? 500,
              statusText: response.statusMessage,
            }),
          );
        });
      },
    );

    request.on("error", reject);
    writeRequestBody(request, body);
    request.end();
  });
}

function createSupabaseFetch(supabaseUrl: string): typeof fetch {
  const allowedOrigin = new URL(supabaseUrl).origin;

  return async (input, init) => {
    try {
      return await fetch(input, init);
    } catch (error) {
      const requestOrigin = new URL(getRequestUrl(input)).origin;

      if (
        process.env.NODE_ENV !== "development" ||
        requestOrigin !== allowedOrigin ||
        !isLeafSignatureError(error)
      ) {
        throw error;
      }

      return fetchWithRelaxedTls(input, init);
    }
  };
}

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase server credentials are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: createSupabaseFetch(supabaseUrl),
    },
  });
}
