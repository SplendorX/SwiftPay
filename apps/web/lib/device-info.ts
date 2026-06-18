export type DeviceInfo = {
  browser: string;
  os: string;
  summary: string;
};

function matchFirst(pattern: RegExp, value: string) {
  const match = value.match(pattern);
  return match?.[1]?.trim() ?? "";
}

export function readDeviceInfo(userAgent = ""): DeviceInfo {
  const agent = userAgent || "Unknown browser";

  const browser =
    matchFirst(/Edg\/([\d.]+)/, agent) ? "Microsoft Edge" :
    matchFirst(/OPR\/([\d.]+)/, agent) ? "Opera" :
    matchFirst(/Chrome\/([\d.]+)/, agent) && !/Edg\/|OPR\//.test(agent)
      ? "Chrome"
      : matchFirst(/Version\/([\d.]+).*Safari/, agent) && !/Chrome|Chromium/.test(agent)
        ? "Safari"
        : matchFirst(/Firefox\/([\d.]+)/, agent)
          ? "Firefox"
          : "Browser";

  const os =
    /Windows NT/i.test(agent)
      ? "Windows"
      : /Mac OS X/i.test(agent)
        ? "macOS"
        : /Android/i.test(agent)
          ? "Android"
          : /iPhone|iPad|iPod/i.test(agent)
            ? "iOS"
            : /Linux/i.test(agent)
              ? "Linux"
              : "Unknown OS";

  return {
    browser,
    os,
    summary: `${browser} on ${os}`,
  };
}