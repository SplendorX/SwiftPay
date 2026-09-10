import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { isAppLocale } from "@/lib/locales";
import {
  buildUsernameCandidate,
  normalizeUsername,
  usernameFromDisplayName,
  validateUsername,
} from "@/lib/profile-utils";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import {
  readWalletToken,
  walletSessionCookieName,
} from "@/lib/wallet-session";

export const runtime = "nodejs";

const profilesTable = process.env.SUPABASE_PROFILES_TABLE ?? "profiles";
const maxUsernameAttempts = 20;

type EnsureProfileBody = {
  authProvider?: unknown;
  circleSocialUuid?: unknown;
  displayName?: unknown;
  walletAddress?: unknown;
};

type UpdateProfileBody = {
  avatarUrl?: unknown;
  bio?: unknown;
  circleSocialUuid?: unknown;
  locale?: unknown;
  username?: unknown;
  walletAddress?: unknown;
};

const profileSelect =
  "wallet_address,username,circle_social_uuid,display_name,avatar_url,bio,auth_provider,created_at,updated_at";
const maxAvatarDataUrlLength = 500_000;
const maxAvatarUrlLength = 500;
const allowedAvatarDataMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function normalizeWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return getAddress(value).toLowerCase();
}

function normalizeDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const displayName = value.trim().replace(/\s+/g, " ");

  if (!displayName || displayName.length > 80) {
    return null;
  }

  return displayName;
}

function normalizeAuthProvider(value: unknown) {
  if (value === "google" || value === "external") {
    return value;
  }

  return "external";
}

function normalizeCircleSocialUuid(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const socialUuid = value.trim();

  if (!socialUuid || socialUuid.length > 120) {
    return null;
  }

  return socialUuid;
}

function normalizeAvatarUrl(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Profile picture must be a valid image.");
  }

  const avatarUrl = value.trim();

  if (!avatarUrl) {
    return null;
  }

  if (avatarUrl.startsWith("data:")) {
    if (avatarUrl.length > maxAvatarDataUrlLength) {
      throw new Error("Profile picture is too large. Upload a smaller image.");
    }

    const match = avatarUrl.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
    );

    if (!match || !allowedAvatarDataMimeTypes.has(match[1])) {
      throw new Error("Profile picture must be a JPG, PNG, or WebP image.");
    }

    return avatarUrl;
  }

  if (avatarUrl.length > maxAvatarUrlLength) {
    throw new Error("Profile picture URL must be 500 characters or fewer.");
  }

  let url: URL;

  try {
    url = new URL(avatarUrl);
  } catch {
    throw new Error("Profile picture must be a valid image.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Profile picture must use an http or https URL.");
  }

  return avatarUrl;
}

function readSupabaseError(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";

  if (message.toLowerCase().includes("permission denied")) {
    return "Supabase rejected access to the profiles table. Run packages/database/supabase/profiles.sql in your Supabase SQL editor.";
  }

  if (message.toLowerCase().includes("does not exist")) {
    return "Create the profiles table with packages/database/supabase/profiles.sql before saving profile data.";
  }

  if (error?.code === "23505") {
    if (message.toLowerCase().includes("username")) {
      return "That username is already taken.";
    }

    return "A profile already exists for this wallet.";
  }

  return message || "Supabase could not save this profile.";
}

async function getSessionOwnerWallet() {
  const cookieStore = await cookies();
  const session = readWalletToken(
    cookieStore.get(walletSessionCookieName)?.value,
    "session",
  );

  return session?.ownerWallet?.toLowerCase() ?? null;
}

async function assertProfileOwnership(input: {
  circleSocialUuid?: string | null;
  walletAddress: string;
}) {
  const sessionOwnerWallet = await getSessionOwnerWallet();

  if (
    sessionOwnerWallet &&
    sessionOwnerWallet === input.walletAddress.toLowerCase()
  ) {
    return true;
  }

  const supabase = createSupabaseAdminClient();
  const existing = await supabase
    .from(profilesTable)
    .select("wallet_address,circle_social_uuid,auth_provider")
    .eq("wallet_address", input.walletAddress)
    .maybeSingle();

  if (existing.error) {
    throw new Error(readSupabaseError(existing.error));
  }

  if (!existing.data) {
    return false;
  }

  if (
    input.circleSocialUuid &&
    existing.data.circle_social_uuid === input.circleSocialUuid
  ) {
    return true;
  }

  return existing.data.auth_provider === "external";
}

async function releaseCircleSocialUuid(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  circleSocialUuid: string,
  keepWalletAddress?: string,
) {
  let query = supabase
    .from(profilesTable)
    .update({
      circle_social_uuid: null,
      updated_at: new Date().toISOString(),
    })
    .eq("circle_social_uuid", circleSocialUuid);

  if (keepWalletAddress) {
    query = query.neq("wallet_address", keepWalletAddress);
  }

  const mutation = await query;

  if (mutation.error) {
    throw new Error(readSupabaseError(mutation.error));
  }
}

async function findAvailableUsername(
  walletAddress: string,
  preferred?: string | null,
) {
  const fallbacks = Array.from({ length: maxUsernameAttempts }, (_, attempt) =>
    buildUsernameCandidate(walletAddress, attempt),
  );
  const candidates = preferred ? [preferred, ...fallbacks] : fallbacks;

  const supabase = createSupabaseAdminClient();

  for (const candidate of candidates) {
    const validationError = validateUsername(candidate);

    if (validationError) {
      continue;
    }

    const existing = await supabase
      .from(profilesTable)
      .select("wallet_address")
      .ilike("username", candidate)
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      throw new Error(readSupabaseError(existing.error));
    }

    if (!existing.data) {
      return candidate;
    }
  }

  throw new Error("Could not generate a unique username.");
}

export async function GET(request: NextRequest) {
  const walletAddress = normalizeWallet(
    request.nextUrl.searchParams.get("wallet"),
  );
  const usernameParam = request.nextUrl.searchParams.get("username");

  if (!walletAddress && !usernameParam) {
    return jsonError(
      "A wallet or username query parameter is required.",
      400,
    );
  }

  if (walletAddress && usernameParam) {
    return jsonError("Provide either wallet or username, not both.", 400);
  }

  try {
    const supabase = createSupabaseAdminClient();

    if (usernameParam) {
      const username = normalizeUsername(usernameParam);
      const validationError = validateUsername(username);

      if (validationError) {
        return jsonError(validationError, 400);
      }

      const { data, error } = await supabase
        .from(profilesTable)
        .select(profileSelect)
        .ilike("username", username)
        .limit(1)
        .maybeSingle();

      if (error) {
        return jsonError(readSupabaseError(error), 500);
      }

      if (!data) {
        return jsonError("Profile not found.", 404);
      }

      return NextResponse.json({ profile: data });
    }

    const { data, error } = await supabase
      .from(profilesTable)
      .select(profileSelect)
      .eq("wallet_address", walletAddress!)
      .maybeSingle();

    if (error) {
      return jsonError(readSupabaseError(error), 500);
    }

    if (!data) {
      return jsonError("Profile not found.", 404);
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Profile could not be loaded.";

    return jsonError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  let body: EnsureProfileBody;

  try {
    body = (await request.json()) as EnsureProfileBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const walletAddress = normalizeWallet(body.walletAddress);

  if (!walletAddress) {
    return jsonError("A valid wallet address is required.", 400);
  }

  const authProvider = normalizeAuthProvider(body.authProvider);
  const circleSocialUuid = normalizeCircleSocialUuid(body.circleSocialUuid);
  const displayName = normalizeDisplayName(body.displayName);

  try {
    const supabase = createSupabaseAdminClient();
    const existing = await supabase
      .from(profilesTable)
      .select(profileSelect)
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (existing.error) {
      return jsonError(readSupabaseError(existing.error), 500);
    }

    if (existing.data) {
      const updates: Record<string, string | null> = {};

      if (
        circleSocialUuid &&
        existing.data.circle_social_uuid !== circleSocialUuid
      ) {
        await releaseCircleSocialUuid(
          supabase,
          circleSocialUuid,
          walletAddress,
        );
        updates.circle_social_uuid = circleSocialUuid;
      }

      if (displayName && !existing.data.display_name) {
        updates.display_name = displayName;
      }

      if (authProvider === "google" && existing.data.auth_provider !== "google") {
        updates.auth_provider = authProvider;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        const mutation = await supabase
          .from(profilesTable)
          .update(updates)
          .eq("wallet_address", walletAddress)
          .select(profileSelect)
          .single();

        if (mutation.error) {
          return jsonError(readSupabaseError(mutation.error), 500);
        }

        return NextResponse.json({ profile: mutation.data });
      }

      return NextResponse.json({ profile: existing.data });
    }

    if (circleSocialUuid) {
      await releaseCircleSocialUuid(supabase, circleSocialUuid, walletAddress);
    }

    const username = await findAvailableUsername(
      walletAddress,
      usernameFromDisplayName(displayName),
    );
    const profile = {
      auth_provider: authProvider,
      circle_social_uuid: circleSocialUuid,
      display_name: displayName,
      updated_at: new Date().toISOString(),
      username,
      wallet_address: walletAddress,
    };
    const mutation = await supabase
      .from(profilesTable)
      .insert(profile)
      .select(profileSelect)
      .single();

    if (mutation.error) {
      return jsonError(readSupabaseError(mutation.error), 500);
    }

    return NextResponse.json({ profile: mutation.data }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Profile could not be created.";

    return jsonError(message, 500);
  }
}

export async function PATCH(request: NextRequest) {
  let body: UpdateProfileBody;

  try {
    body = (await request.json()) as UpdateProfileBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const walletAddress = normalizeWallet(body.walletAddress);
  const hasUsername = typeof body.username === "string" && body.username.trim().length > 0;
  const username = hasUsername
    ? normalizeUsername(body.username as string)
    : "";
  const locale =
    typeof body.locale === "string" && isAppLocale(body.locale)
      ? body.locale
      : null;
  const circleSocialUuid = normalizeCircleSocialUuid(body.circleSocialUuid);
  const validationError = hasUsername ? validateUsername(username) : null;
  let avatarUrl: string | null | undefined;

  try {
    avatarUrl = normalizeAvatarUrl(body.avatarUrl);
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Profile picture must be a valid image.",
      400,
    );
  }

  if (!walletAddress) {
    return jsonError("A valid wallet address is required.", 400);
  }

  if (hasUsername && validationError) {
    return jsonError(validationError, 400);
  }

  try {
    const canEdit = await assertProfileOwnership({
      circleSocialUuid,
      walletAddress,
    });

    if (!canEdit) {
      return jsonError(
        "Connect the active wallet profile before editing your username.",
        401,
      );
    }

    const supabase = createSupabaseAdminClient();
    const updates: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };

    if (hasUsername) {
      updates.username = username;
    }

    if (locale) {
      updates.locale = locale;
    }

    if (avatarUrl !== undefined) {
      updates.avatar_url = avatarUrl;
    }

    if (typeof body.bio === "string") {
      updates.bio = body.bio.trim().slice(0, 160) || null;
    } else if (body.bio === null) {
      updates.bio = null;
    }

    const mutation = await supabase
      .from(profilesTable)
      .update(updates)
      .eq("wallet_address", walletAddress)
      .select(profileSelect)
      .single();

    if (mutation.error) {
      return jsonError(readSupabaseError(mutation.error), 500);
    }

    return NextResponse.json({ profile: mutation.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Username could not be updated.";

    return jsonError(message, 500);
  }
}

