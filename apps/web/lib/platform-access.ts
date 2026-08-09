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

function hasPlatformAccessCookie() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${platformAccessCookieName}=`));
}

/** Refresh the access cookie without broadcasting (safe inside event listeners). */
export function ensurePlatformAccessCookie() {
  writePlatformAccessCookie();
}

export function markPlatformProfileConnected() {
  const alreadyMarked = hasPlatformAccessCookie();
  writePlatformAccessCookie();
  if (!alreadyMarked) {
    notifyPlatformAccessChanged();
  }
}

export function clearPlatformProfileConnected() {
  const hadCookie = hasPlatformAccessCookie();
  removePlatformAccessCookie();
  if (hadCookie) {
    notifyPlatformAccessChanged();
  }
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

  const next = address.toLowerCase();
  const previous = window.localStorage.getItem(activatedExternalProfileKey);
  const alreadyCookie = hasPlatformAccessCookie();

  window.localStorage.setItem(activatedExternalProfileKey, next);
  writePlatformAccessCookie();

  // Avoid event storms when nothing meaningful changed.
  if (previous !== next || !alreadyCookie) {
    notifyPlatformAccessChanged();
  }
}

export function clearActivatedExternalProfile() {
  if (typeof window === "undefined") {
    return;
  }

  const hadProfile = Boolean(
    window.localStorage.getItem(activatedExternalProfileKey),
  );
  const hadCookie = hasPlatformAccessCookie();

  window.localStorage.removeItem(activatedExternalProfileKey);
  removePlatformAccessCookie();

  if (hadProfile || hadCookie) {
    notifyPlatformAccessChanged();
  }
}
