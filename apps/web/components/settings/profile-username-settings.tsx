"use client";

import {
  CheckCircle2,
  Copy,
  ImageIcon,
  Loader2,
  Save,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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

const acceptedAvatarMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const avatarAcceptedFileTypes = acceptedAvatarMimeTypes.join(",");
const maxAvatarUploadBytes = 5 * 1024 * 1024;
const avatarCanvasSize = 384;
const maxAvatarDataUrlLength = 500_000;

function validateAvatarFile(file: File) {
  if (!acceptedAvatarMimeTypes.includes(file.type)) {
    return "Profile picture must be a JPG, PNG, or WebP image.";
  }

  if (file.size > maxAvatarUploadBytes) {
    return "Profile picture must be 5 MB or smaller.";
  }

  return null;
}

function loadImageFromObjectUrl(objectUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Profile picture could not be opened."));
    image.src = objectUrl;
  });
}

async function resizeAvatarFile(file: File) {
  const validationError = validateAvatarFile(file);

  if (validationError) {
    throw new Error(validationError);
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const sourceSize = Math.min(sourceWidth, sourceHeight);

    if (!sourceWidth || !sourceHeight || !sourceSize) {
      throw new Error("Profile picture could not be opened.");
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Profile picture could not be processed.");
    }

    canvas.width = avatarCanvasSize;
    canvas.height = avatarCanvasSize;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, avatarCanvasSize, avatarCanvasSize);
    context.drawImage(
      image,
      (sourceWidth - sourceSize) / 2,
      (sourceHeight - sourceSize) / 2,
      sourceSize,
      sourceSize,
      0,
      0,
      avatarCanvasSize,
      avatarCanvasSize,
    );

    for (const quality of [0.86, 0.76, 0.66, 0.56]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);

      if (dataUrl.length <= maxAvatarDataUrlLength) {
        return dataUrl;
      }
    }

    throw new Error("Profile picture is too large. Upload a smaller image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getAvatarInitials(profile: ProfileRecord | null, fallback: string) {
  const label = profile?.username || profile?.display_name || fallback;
  const normalized = label.replace(/^@+/, "").replace(/[_-]+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  return normalized
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
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
  const [avatarImageInput, setAvatarImageInput] = useState("");
  const [avatarFileName, setAvatarFileName] = useState("");
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAvatarProcessing, setIsAvatarProcessing] = useState(false);
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
          setAvatarImageInput("");
          setAvatarFileName("");
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
          setAvatarImageInput(nextProfile.avatar_url ?? "");
          setAvatarFileName("");
          setAvatarPreviewFailed(false);
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
        setAvatarImageInput(updatedProfile.avatar_url ?? "");
        setAvatarFileName("");
        setAvatarPreviewFailed(false);
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

  async function handleAvatarFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    setIsAvatarProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const dataUrl = await resizeAvatarFile(file);

      setAvatarImageInput(dataUrl);
      setAvatarFileName(file.name);
      setAvatarPreviewFailed(false);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Profile picture could not be processed.",
      );
    } finally {
      input.value = "";
      setIsAvatarProcessing(false);
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
        avatarUrl: avatarImageInput.trim() || null,
        circleSocialUuid: circleIdentity.socialUserUUID,
        username: usernameInput,
        walletAddress: activeWalletAddress,
      });

      setProfile(updatedProfile);
      setUsernameInput(updatedProfile.username);
      setAvatarImageInput(updatedProfile.avatar_url ?? "");
      setAvatarFileName("");
      setAvatarPreviewFailed(false);
      setSuccess("Profile updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Profile could not be updated.",
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
  const avatarImage = avatarImageInput.trim();
  const avatarInitials = getAvatarInitials(profile, profileLabel);
  const profileChanged = Boolean(
    profile &&
      (usernameInput !== profile.username ||
        avatarImage !== (profile.avatar_url ?? "")),
  );

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
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-primary shadow-sm">
                  {avatarImage && !avatarPreviewFailed ? (
                    <img
                      alt="Profile preview"
                      className="h-full w-full object-cover"
                      onError={() => setAvatarPreviewFailed(true)}
                      src={avatarImage}
                    />
                  ) : avatarInitials ? (
                    <span className="text-lg font-black">{avatarInitials}</span>
                  ) : (
                    <ImageIcon className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Profile picture
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload a photo from your device.
                  </p>
                  {avatarFileName ? (
                    <p className="mt-1 max-w-[14rem] truncate text-xs text-muted-foreground">
                      {avatarFileName}
                    </p>
                  ) : null}
                </div>
              </div>
              {avatarImage ? (
                <button
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary sm:ml-auto"
                  onClick={() => {
                    setAvatarImageInput("");
                    setAvatarFileName("");
                    setAvatarPreviewFailed(false);
                    setError(null);
                    setSuccess(null);
                  }}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              ) : null}
            </div>

            <div className="mt-3">
              <input
                accept={avatarAcceptedFileTypes}
                className="sr-only"
                disabled={isAvatarProcessing || isSaving}
                id="profile-avatar-file"
                onChange={(event) => void handleAvatarFileChange(event)}
                type="file"
              />
              <label
                aria-disabled={isAvatarProcessing || isSaving}
                className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary ${
                  isAvatarProcessing || isSaving
                    ? "pointer-events-none opacity-60"
                    : ""
                }`}
                htmlFor="profile-avatar-file"
              >
                {isAvatarProcessing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isAvatarProcessing
                  ? "Processing..."
                  : avatarImage
                    ? "Change photo"
                    : "Upload photo"}
              </label>
            </div>
          </div>

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
                  isAvatarProcessing ||
                  !usernameInput ||
                  !profileChanged
                }
                onClick={() => void handleSave()}
                type="button"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save profile
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
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
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
          <ImageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Wallet profile</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose how other SwiftPay users see you. New wallet and Google
            profiles start with defaults you can change here.
          </p>
          {content}
        </div>
      </div>
    </section>
  );
}
