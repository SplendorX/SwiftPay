import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  circleRequest,
  listWalletAddressesForUserToken,
} from "@/lib/circle-user-server";
import { createSignedToken, readSignedToken } from "@/lib/wallet-session";

export const emailSessionCookieName = "saphra_email_session";
/** Long enough to finish PIN setup; the wallet session takes over after. */
export const emailSessionTtlMs = 30 * 60 * 1000;

export type EmailSession = {
  circleUserId: string;
  email: string;
  expiresAt: string;
  type: "email";
};

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
    ? email
    : null;
}

/** Supabase Auth client for email OTP. The anon key is enough; fall back to service role. */
function supabaseAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Email sign-in needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

/** Email a one-time sign-in code. Creates the Supabase user on first use. */
export async function sendEmailCode(email: string) {
  const { error } = await supabaseAuth().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    throw new Error(
      error.status === 429
        ? "Too many codes requested. Wait a minute and try again."
        : error.message || "The sign-in code could not be sent.",
    );
  }
}

/** Check the code and return the verified Supabase user id. */
export async function verifyEmailCode(email: string, code: string) {
  const { data, error } = await supabaseAuth().auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error || !data.user?.id) {
    throw new Error("That code is invalid or has expired. Request a new one.");
  }
  return data.user.id;
}

/**
 * One Circle user per verified Supabase account. Circle caps user ids at
 * 5–50 characters: "sp-email-" (9) + a UUID (36) = 45. The earlier
 * "swiftpay-email-" prefix made 51 and Circle rejected it ("API parameter
 * invalid"). Never change this format once users exist: it is how a
 * returning email user finds their wallet again.
 */
export function circleUserIdForSupabaseUser(supabaseUserId: string) {
  const id = `sp-email-${supabaseUserId}`;
  if (id.length > 50) {
    throw new Error("Circle user id would exceed 50 characters.");
  }
  return id;
}

/**
 * Create the Circle user if needed and issue a fresh user token. The PIN the
 * user sets in Circle's own screen protects every transaction; SaphraONE never
 * sees it.
 */
export async function issueCircleUserToken(circleUserId: string) {
  const created = await circleRequest("/v1/w3s/users", {
    body: { userId: circleUserId },
    method: "POST",
  });
  // 409 / 155101: the user already exists, which is the returning-user case.
  if (created.status >= 400 && created.status !== 409 && created.body.code !== 155101) {
    throw new Error(
      String(created.body.message ?? "Circle wallet account could not be created."),
    );
  }

  const token = await circleRequest("/v1/w3s/users/token", {
    body: { userId: circleUserId },
    method: "POST",
  });
  const data = token.body.data as { encryptionKey?: string; userToken?: string } | undefined;
  if (token.status >= 400 || !data?.userToken || !data.encryptionKey) {
    throw new Error(String(token.body.message ?? "Circle wallet session could not be started."));
  }
  return { encryptionKey: data.encryptionKey, userToken: data.userToken };
}

/** Wallet addresses owned by a Circle user, checked with a token SaphraONE issued itself. */
export async function listCircleUserWalletAddresses(circleUserId: string) {
  const { userToken } = await issueCircleUserToken(circleUserId);
  return listWalletAddressesForUserToken(userToken);
}

export function createEmailSessionToken(input: { circleUserId: string; email: string }) {
  const session: EmailSession = {
    circleUserId: input.circleUserId,
    email: input.email,
    expiresAt: new Date(Date.now() + emailSessionTtlMs).toISOString(),
    type: "email",
  };
  // A nonce keeps two sessions for the same user from sharing a token.
  return createSignedToken({ ...session, nonce: crypto.randomBytes(12).toString("hex") });
}

export function readEmailSession(token: string | undefined): EmailSession | null {
  const payload = readSignedToken(token) as Partial<EmailSession> | null;
  if (
    !payload ||
    payload.type !== "email" ||
    typeof payload.circleUserId !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.expiresAt !== "string" ||
    Date.parse(payload.expiresAt) <= Date.now()
  ) {
    return null;
  }
  return payload as EmailSession;
}
