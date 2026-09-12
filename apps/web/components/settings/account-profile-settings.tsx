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
import { useEffect, useState, type ChangeEvent } from "react";

import { useOptionalAccount } from "@/components/account/account-provider";
import { useT } from "@/components/locale-provider";
import { useBusinessActor } from "@/components/business/use-business-actor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBusinessAccountProfileClient } from "@/lib/account/client";
import { profileImageAccept, resizeProfileImageFile } from "@/lib/profile-image";
import {
  fetchProfile,
  formatUsernameLabel,
  profileUpdatedEventName,
  updateProfileUsername,
  validateUsername,
  type ProfileRecord,
} from "@/lib/profile";

export function AccountProfileSettings() {
  const t = useT();
  const accountContext = useOptionalAccount();
  const { circleSocialUuid, ownerWallet } = useBusinessActor();
  const isBusiness = accountContext?.isBusiness ?? false;
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const business = accountContext?.profile;
    setBusinessName(business?.business_name ?? "");
    setDescription(business?.description ?? "");
    setCategory(business?.category ?? "");
    setWebsite(business?.website ?? "");
    setContactEmail(business?.contact_email ?? "");
    setCountry(business?.country ?? "");
    setPhone(business?.phone ?? "");
    setLogoUrl(business?.logo_url ?? "");
  }, [accountContext?.profile]);

  useEffect(() => {
    if (!ownerWallet) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchProfile(ownerWallet)
      .then((next) => {
        if (cancelled || !next) return;
        setProfile(next);
        setUsername(next.username);
        setBio(next.bio ?? "");
        setAvatarUrl(next.avatar_url ?? "");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Profile could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerWallet]);

  async function handleImage(
    event: ChangeEvent<HTMLInputElement>,
    kind: "avatar" | "logo",
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImageBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const dataUrl = await resizeProfileImageFile(file);
      if (kind === "logo") setLogoUrl(dataUrl);
      else setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image could not be processed.");
    } finally {
      input.value = "";
      setImageBusy(false);
    }
  }

  async function save() {
    if (!ownerWallet) {
      setError(t("settings.connectBeforeSave"));
      return;
    }
    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }
    if (isBusiness && !businessName.trim()) {
      setError(t("settings.enterBusinessName"));
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateProfileUsername({
        avatarUrl: isBusiness ? avatarUrl || null : avatarUrl.trim() || null,
        bio: isBusiness ? undefined : bio,
        circleSocialUuid,
        username,
        walletAddress: ownerWallet,
      });
      setProfile(updated);
      if (isBusiness) {
        await updateBusinessAccountProfileClient(
          ownerWallet,
          {
            businessName,
            category,
            contactEmail,
            country,
            description,
            logoUrl: logoUrl || null,
            phone,
            website,
          },
          circleSocialUuid,
        );
        await accountContext?.refresh();
      }
      window.dispatchEvent(
        new CustomEvent(profileUpdatedEventName, { detail: updated }),
      );
      setSuccess(t("settings.profileUpdated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  if (!ownerWallet) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("settings.connectToEdit")}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("settings.loadingProfile")}
      </div>
    );
  }

  const image = isBusiness ? logoUrl : avatarUrl;

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {isBusiness ? t("settings.businessProfile") : t("settings.personalProfile")}
      </p>

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
            {image ? (
              <img alt="" className="h-full w-full object-cover" src={image} />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {isBusiness ? t("settings.businessLogo") : t("settings.profilePicture")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("settings.imageHint")}</p>
          </div>
          {image ? (
            <button
              className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold"
              onClick={() => (isBusiness ? setLogoUrl("") : setAvatarUrl(""))}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
              {t("common.clear")}
            </button>
          ) : null}
        </div>
        <div className="mt-3">
          <input
            accept={profileImageAccept}
            className="sr-only"
            disabled={imageBusy || busy}
            id="account-profile-image"
            onChange={(event) => void handleImage(event, isBusiness ? "logo" : "avatar")}
            type="file"
          />
          <label
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border bg-background px-3 text-xs font-semibold"
            htmlFor="account-profile-image"
          >
            {imageBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {imageBusy
              ? t("common.processing")
              : image
                ? t("common.changePhoto")
                : t("common.uploadPhoto")}
          </label>
        </div>
      </div>

      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {t("common.username")}
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            @
          </span>
          <Input
            className="h-11 pl-7"
            onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))}
            value={username}
          />
        </div>
      </label>

      {profile?.username ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="truncate text-xs text-muted-foreground">
            {t("settings.publicHandle")}{" "}
            <span className="font-semibold text-foreground">
              {formatUsernameLabel(profile.username)}
            </span>
          </p>
          <button
            className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-semibold"
            onClick={() => {
              void navigator.clipboard.writeText(formatUsernameLabel(profile.username));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
            type="button"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t("common.copied") : t("common.copy")}
          </button>
        </div>
      ) : null}

      {isBusiness ? (
        <>
          <label className="block text-sm font-medium">
            {t("common.businessName")}
            <Input
              className="mt-2 h-11"
              onChange={(event) => setBusinessName(event.target.value)}
              value={businessName}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("common.description")}
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              maxLength={280}
              onChange={(event) => setDescription(event.target.value.slice(0, 280))}
              value={description}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("common.category")}
            <Input
              className="mt-2 h-11"
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("common.website")}
            <Input
              className="mt-2 h-11"
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://"
              value={website}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("common.contactEmail")}
            <Input
              className="mt-2 h-11"
              onChange={(event) => setContactEmail(event.target.value)}
              value={contactEmail}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              {t("common.country")}
              <Input
                className="mt-2 h-11"
                onChange={(event) => setCountry(event.target.value)}
                value={country}
              />
            </label>
            <label className="block text-sm font-medium">
              {t("common.phone")}
              <Input
                className="mt-2 h-11"
                onChange={(event) => setPhone(event.target.value)}
                value={phone}
              />
            </label>
          </div>
        </>
      ) : (
        <label className="block text-sm font-medium">
          {t("common.bio")}
          <textarea
            className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            maxLength={160}
            onChange={(event) => setBio(event.target.value.slice(0, 160))}
            value={bio}
          />
        </label>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p> : null}

      <Button disabled={busy || imageBusy} onClick={() => void save()} type="button">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {t("settings.saveProfile")}
      </Button>
    </div>
  );
}
