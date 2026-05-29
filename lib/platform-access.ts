import { recordPlatformProfileCreation } from "@/lib/platform-analytics";

export const platformAccessEventName = "swiftpay:platform-access";
export const platformAccessCookieName = "swiftpay_platform_access";

const activatedExternalProfileKey = "swiftpay.platform.externalProfile";
const platformAccessCookieMaxAge = 60 * 60 * 24 * 30;

function getSecureCookieAttribute() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.protocol === "https:" ? "; Secure" : "";
}

function notifyPlatformAccessChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(platformAccessEventName));
}

function writePlatformAccessCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${platformAccessCookieName}=1; Path=/; Max-Age=${platformAccessCookieMaxAge}; SameSite=Lax${getSecureCookieAttribute()}`;
}

function removePlatformAccessCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${platformAccessCookieName}=; Path=/; Max-Age=0; SameSite=Lax${getSecureCookieAttribute()}`;
}

export function markPlatformProfileConnected() {
  writePlatformAccessCookie();
  notifyPlatformAccessChanged();
}

export function clearPlatformProfileConnected() {
  removePlatformAccessCookie();
  notifyPlatformAccessChanged();
}

export function readActivatedExternalProfile() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(activatedExternalProfileKey) ?? "";
}

export function writeActivatedExternalProfile(address: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    activatedExternalProfileKey,
    address.toLowerCase(),
  );
  recordPlatformProfileCreation({
    metadata: {
      profileType: "external_wallet",
    },
    profileId: address,
    provider: "external_wallet",
    walletAddress: address,
  });
  writePlatformAccessCookie();
  notifyPlatformAccessChanged();
}

export function clearActivatedExternalProfile() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(activatedExternalProfileKey);
  removePlatformAccessCookie();
  notifyPlatformAccessChanged();
}
