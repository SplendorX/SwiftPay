"use client";

import { getAddress, isAddress } from "viem";

import {
  normalizeUsername,
  validateUsername,
} from "@/lib/profile-utils";

export {
  buildUsernameCandidate,
  formatUsernameLabel,
  normalizeUsername,
  validateUsername,
} from "@/lib/profile-utils";

export const profileUpdatedEventName = "swiftpay:profile-updated";

export type ProfileRecord = {
  auth_provider: string;
  circle_social_uuid: string | null;
  created_at: string;
  display_name: string | null;
  updated_at: string;
  username: string;
  wallet_address: string;
};

export type EnsureProfileInput = {
  authProvider?: "external" | "google";
  circleSocialUuid?: string;
  displayName?: string;
  walletAddress: string;
};

function notifyProfileUpdated(profile: ProfileRecord) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(profileUpdatedEventName, { detail: profile }),
  );
}

function normalizeWalletAddress(value: string) {
  if (!isAddress(value)) {
    return null;
  }

  return getAddress(value).toLowerCase();
}

export async function fetchProfile(walletAddress: string) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);

  if (!normalizedWallet) {
    return null;
  }

  const response = await fetch(
    `/api/profile?wallet=${encodeURIComponent(normalizedWallet)}`,
    { cache: "no-store" },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? "Profile could not be loaded.");
  }

  const payload = (await response.json()) as { profile: ProfileRecord };
  return payload.profile;
}

export async function fetchProfileByUsername(username: string) {
  const normalizedUsername = normalizeUsername(username);
  const validationError = validateUsername(normalizedUsername);

  if (validationError) {
    return null;
  }

  const response = await fetch(
    `/api/profile?username=${encodeURIComponent(normalizedUsername)}`,
    { cache: "no-store" },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? "Profile could not be loaded.");
  }

  const payload = (await response.json()) as { profile: ProfileRecord };
  return payload.profile;
}

export async function ensureProfile(input: EnsureProfileInput) {
  const walletAddress = normalizeWalletAddress(input.walletAddress);

  if (!walletAddress) {
    return null;
  }

  const response = await fetch("/api/profile", {
    body: JSON.stringify({
      authProvider: input.authProvider ?? "external",
      circleSocialUuid: input.circleSocialUuid,
      displayName: input.displayName,
      walletAddress,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? "Profile could not be created.");
  }

  const payload = (await response.json()) as { profile: ProfileRecord };
  notifyProfileUpdated(payload.profile);
  return payload.profile;
}

export async function updateProfileUsername(input: {
  circleSocialUuid?: string;
  username: string;
  walletAddress: string;
}) {
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const username = normalizeUsername(input.username);
  const validationError = validateUsername(username);

  if (!walletAddress) {
    throw new Error("A valid wallet address is required.");
  }

  if (validationError) {
    throw new Error(validationError);
  }

  const response = await fetch("/api/profile", {
    body: JSON.stringify({
      circleSocialUuid: input.circleSocialUuid,
      username,
      walletAddress,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? "Username could not be updated.");
  }

  const payload = (await response.json()) as { profile: ProfileRecord };
  notifyProfileUpdated(payload.profile);
  return payload.profile;
}