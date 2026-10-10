// Server-only. The "you signed in" email after a Google or email sign-in.
import crypto from "node:crypto";

import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { securityEmailConfigured, sendSignInAlert, validEmail } from "@/lib/tx-approval/email";

/** At most this many sign-in emails per address per hour. */
const ALERTS_PER_HOUR = 4;

/** "Chrome 141 on Windows", "Safari 26.2 on iPhone (iOS 18.7)". Best effort. */
export function describeBrowser(userAgent: string | null) {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown browser";
  const version = (pattern: RegExp) => ua.match(pattern)?.[1]?.split(".").slice(0, 2).join(".");

  let browser = "A browser";
  if (/Edg\//.test(ua)) browser = `Edge ${version(/Edg\/([\d.]+)/) ?? ""}`;
  else if (/OPR\//.test(ua)) browser = `Opera ${version(/OPR\/([\d.]+)/) ?? ""}`;
  else if (/SamsungBrowser\//.test(ua)) browser = `Samsung Internet ${version(/SamsungBrowser\/([\d.]+)/) ?? ""}`;
  else if (/CriOS\//.test(ua)) browser = `Chrome ${version(/CriOS\/([\d.]+)/) ?? ""}`;
  else if (/FxiOS\//.test(ua)) browser = `Firefox ${version(/FxiOS\/([\d.]+)/) ?? ""}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${version(/Firefox\/([\d.]+)/) ?? ""}`;
  else if (/Chrome\//.test(ua)) browser = `Chrome ${version(/Chrome\/([\d.]+)/) ?? ""}`;
  else if (/Safari\//.test(ua)) browser = `Safari ${version(/Version\/([\d.]+)/) ?? ""}`;

  let device = "";
  const ios = ua.match(/OS (\d+)[_.](\d+)(?:[_.]\d+)? like Mac OS X/);
  if (/iPhone/.test(ua)) device = `Apple iPhone${ios ? ` (iOS ${ios[1]}.${ios[2]})` : ""}`;
  else if (/iPad/.test(ua)) device = `Apple iPad${ios ? ` (iPadOS ${ios[1]}.${ios[2]})` : ""}`;
  else if (/Android/.test(ua)) device = `Android${ua.match(/Android ([\d.]+)/) ? ` ${ua.match(/Android ([\d.]+)/)![1]}` : ""}`;
  else if (/Windows NT/.test(ua)) device = "Windows";
  else if (/Mac OS X/.test(ua)) device = "Mac";
  else if (/CrOS/.test(ua)) device = "ChromeOS";
  else if (/Linux/.test(ua)) device = "Linux";

  return `${browser.trim()}${device ? ` on ${device}` : ""}`;
}

/** City and country from Vercel's edge headers; null locally or when unknown. */
export function describeLocation(headers: Headers) {
  const decode = (value: string | null) => {
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const city = decode(headers.get("x-vercel-ip-city"));
  const countryCode = headers.get("x-vercel-ip-country");
  let country: string | null = null;
  if (countryCode) {
    try {
      country = new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;
    } catch {
      country = countryCode;
    }
  }
  return [city, country].filter(Boolean).join(", ") || null;
}

function formatTime(at: Date) {
  const day = at.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" });
  const date = at.toLocaleDateString("en-GB", { day: "2-digit", month: "long", timeZone: "UTC", year: "numeric" });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, minute: "2-digit", timeZone: "UTC" });
  return `${day}, ${date} ${time} UTC`;
}

/** The profile's saved contact email, and the name to greet. */
async function profileFor(ownerWallet: string) {
  try {
    const { data } = await createSupabaseAdminClient()
      .from(process.env.SUPABASE_PROFILES_TABLE ?? "profiles")
      .select("contact_email,display_name,username")
      .eq("wallet_address", ownerWallet.toLowerCase())
      .maybeSingle();
    const row = data as {
      contact_email?: string | null;
      display_name?: string | null;
      username?: string | null;
    } | null;
    const first = row?.display_name?.trim().split(/\s+/)[0];
    return { email: validEmail(row?.contact_email), name: first || row?.username || null };
  } catch {
    return { email: null, name: null };
  }
}

/**
 * After an email sign-in, the address that received the code is verified:
 * save it as the profile's contact email when none is set, so security
 * emails (this alert, payment codes) have somewhere to go.
 */
export async function saveVerifiedContactEmail(ownerWallet: string, email: string) {
  const verified = validEmail(email);
  if (!verified) return;
  try {
    await createSupabaseAdminClient()
      .from(process.env.SUPABASE_PROFILES_TABLE ?? "profiles")
      .update({ contact_email: verified })
      .eq("wallet_address", ownerWallet.toLowerCase())
      .is("contact_email", null);
  } catch (error) {
    console.warn("[sign-in-alert] contact email", error instanceof Error ? error.message : error);
  }
}

/**
 * Email the owner that they just signed in, at the contact email saved on
 * their profile. No saved contact email, no alert: an address the browser
 * names is never used. Capped per address.
 */
export async function notifySignIn(input: {
  headers: Headers;
  host: string;
  origin: string;
  ownerWallet: string;
}) {
  if (!securityEmailConfigured()) return;
  try {
    const { email, name } = await profileFor(input.ownerWallet);
    if (!email) return;
    if (!(await consumeRateLimit(`sign-in-alert:${email}`, ALERTS_PER_HOUR, 3600))) return;

    await sendSignInAlert(
      email,
      {
        browser: describeBrowser(input.headers.get("user-agent")),
        host: input.host,
        location: describeLocation(input.headers),
        name,
        supportUrl: `${input.origin}/support`,
        time: formatTime(new Date()),
      },
      `sign-in-${input.ownerWallet.toLowerCase()}-${crypto.randomUUID()}`,
    );
  } catch (error) {
    // A notice never blocks signing in.
    console.warn("[sign-in-alert]", error instanceof Error ? error.message : error);
  }
}
