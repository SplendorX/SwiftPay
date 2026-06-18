"use client";

import { AtSign, CheckCircle2, Copy, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  callCircleWalletApi,
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleWallet,
} from "@/lib/circle-session";
import {
  ensureProfile,
  fetchProfile,
  formatUsernameLabel,
  profileUpdatedEventName,
  updateProfileUsername,
  validateUsername,
  type ProfileRecord,
} from "@/lib/profile";
import { readActivatedExternalProfile } from "@/lib/platform-access";

function resolveExternalWalletAddress(
  connectedAddress?: string,
  activatedProfile?: string,
) {
  const normalizedConnected = connectedAddress?.toLowerCase() ?? "";
  const normalizedActivated = activatedProfile?.toLowerCase() ?? "";

  if (
    normalizedConnected &&
    normalizedActivated &&
    normalizedConnected === normalizedActivated
  ) {
    return normalizedConnected;
  }

  return normalizedActivated || normalizedConnected;
}

type ProfileUsernameSettingsProps = {
  embedded?: boolean;
};

export function ProfileUsernameSettings({
  embedded = false,
}: ProfileUsernameSettingsProps) {
  const { address, isConnected } = useAccount();
  const [circleWalletAddress, setCircleWalletAddress] = useState("");
  const [activatedExternalProfile, setActivatedExternalProfile] = useState("");
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [circleLogin, setCircleLogin] = useState(() => readCircleLogin());
  const circleIdentity = getCircleLoginIdentity(circleLogin);

  useEffect(() => {
    function refreshCircleLogin() {
      setCircleLogin(readCircleLogin());
    }

    refreshCircleLogin();
    window.addEventListener(circleSessionEventName, refreshCircleLogin);
    window.addEventListener("storage", refreshCircleLogin);

    return () => {
      window.removeEventListener(circleSessionEventName, refreshCircleLogin);
      window.removeEventListener("storage", refreshCircleLogin);
    };
  }, []);

  const activeWalletAddress = useMemo(() => {
    if (circleLogin && circleWalletAddress) {
      return circleWalletAddress.toLowerCase();
    }

    return resolveExternalWalletAddress(address, activatedExternalProfile);
  }, [
    activatedExternalProfile,
    address,
    circleLogin,
    circleWalletAddress,
  ]);

  useEffect(() => {
    function refreshActivatedProfile() {
      setActivatedExternalProfile(readActivatedExternalProfile());
    }

    refreshActivatedProfile();
    window.addEventListener("storage", refreshActivatedProfile);
    window.addEventListener(profileUpdatedEventName, refreshActivatedProfile);

    return () => {
      window.removeEventListener("storage", refreshActivatedProfile);
      window.removeEventListener(
        profileUpdatedEventName,
        refreshActivatedProfile,
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCircleWalletAddress() {
      if (!circleLogin?.userToken) {
        if (!cancelled) {
          setCircleWalletAddress("");
        }
        return;
      }

      const cachedAddress = readCircleWallets()[0]?.address ?? "";

      if (cachedAddress && !cancelled) {
        setCircleWalletAddress(cachedAddress);
      }

      try {
        const payload = await callCircleWalletApi<{ wallets?: CircleWallet[] }>(
          "listWallets",
          { userToken: circleLogin.userToken },
        );
        const walletAddress = payload.wallets?.[0]?.address ?? "";

        if (!cancelled) {
          setCircleWalletAddress(walletAddress);
        }
      } catch {
        if (!cancelled && !cachedAddress) {
          setCircleWalletAddress("");
        }
      }
    }

    void loadCircleWalletAddress();

    return () => {
      cancelled = true;
    };
  }, [circleLogin?.userToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!activeWalletAddress) {
        if (!cancelled) {
          setProfile(null);
          setUsernameInput("");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let nextProfile = await fetchProfile(activeWalletAddress);

        if (!nextProfile) {
          nextProfile = await ensureProfile({
            authProvider: circleLogin ? "google" : "external",
            circleSocialUuid: circleIdentity.socialUserUUID,
            displayName: circleIdentity.name,
            walletAddress: activeWalletAddress,
          });
        }

        if (!cancelled && nextProfile) {
          setProfile(nextProfile);
          setUsernameInput(nextProfile.username);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Profile could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [
    activeWalletAddress,
    circleIdentity.name,
    circleIdentity.socialUserUUID,
    circleLogin,
    isConnected,
  ]);

  useEffect(() => {
    function handleProfileUpdated(event: Event) {
      const customEvent = event as CustomEvent<ProfileRecord>;
      const updatedProfile = customEvent.detail;

      if (
        updatedProfile?.wallet_address?.toLowerCase() === activeWalletAddress
      ) {
        setProfile(updatedProfile);
        setUsernameInput(updatedProfile.username);
      }
    }

    window.addEventListener(profileUpdatedEventName, handleProfileUpdated);
    window.addEventListener(circleSessionEventName, () => {
      setActivatedExternalProfile(readActivatedExternalProfile());
    });

    return () => {
      window.removeEventListener(
        profileUpdatedEventName,
        handleProfileUpdated,
      );
    };
  }, [activeWalletAddress]);

  async function copyUsername(username: string) {
    if (typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatUsernameLabel(username));
      setCopiedUsername(true);
      window.setTimeout(() => setCopiedUsername(false), 1600);
    } catch {
      setCopiedUsername(false);
    }
  }

  async function handleSave() {
    if (!activeWalletAddress) {
      setError("Connect a wallet profile before saving a username.");
      return;
    }

    const validationError = validateUsername(usernameInput);

    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedProfile = await updateProfileUsername({
        circleSocialUuid: circleIdentity.socialUserUUID,
        username: usernameInput,
        walletAddress: activeWalletAddress,
      });

      setProfile(updatedProfile);
      setUsernameInput(updatedProfile.username);
      setSuccess("Username updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Username could not be updated.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const profileLabel = circleLogin
    ? circleIdentity.email ?? circleIdentity.name ?? "Google profile"
    : activeWalletAddress
      ? `${activeWalletAddress.slice(0, 6)}...${activeWalletAddress.slice(-4)}`
      : "No wallet profile";

  const content = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Active profile
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{profileLabel}</p>

      {isLoading ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profile...
        </div>
      ) : activeWalletAddress ? (
        <div className="mt-4 space-y-3">
          <div>
            <label
              className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              htmlFor="profile-username"
            >
              Username
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  autoComplete="off"
                  className="h-11 pl-7"
                  id="profile-username"
                  onChange={(event) => {
                    setUsernameInput(
                      event.target.value.toLowerCase().replace(/\s/g, ""),
                    );
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="your_username"
                  spellCheck={false}
                  value={usernameInput}
                />
              </div>
              <Button
                className="h-11 shrink-0"
                disabled={
                  isSaving ||
                  !usernameInput ||
                  usernameInput === profile?.username
                }
                onClick={() => void handleSave()}
                type="button"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save username
              </Button>
            </div>
          </div>

          {profile ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                Current public handle:{" "}
                <span className="font-semibold text-foreground">
                  {formatUsernameLabel(profile.username)}
                </span>
              </p>
              <button
                aria-label="Copy username"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
                onClick={() => void copyUsername(profile.username)}
                type="button"
              >
                {copiedUsername ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedUsername ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {success}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Connect a wallet or sign in with Google from Home to manage your
          username.
        </p>
      )}
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm sm:px-5 sm:py-5">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
          <AtSign className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Username</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose how other SwiftPay users see you. New wallet and Google
            profiles start with an auto-generated username you can change here.
          </p>
          {content}
        </div>
      </div>
    </section>
  );
}