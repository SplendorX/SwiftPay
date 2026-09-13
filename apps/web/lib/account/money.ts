export function parseMoney(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : String(value ?? "");
  if (!raw || !/^\d+(\.\d{1,6})?$/.test(raw)) {
    throw new Error("Enter a valid amount.");
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter a valid amount.");
  }
  return raw;
}

export function moneyNumber(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function roundMoney(value: number) {
  return (Math.round(value * 1_000_000) / 1_000_000).toFixed(6).replace(/\.?0+$/, "") || "0";
}

export function profileCompletionPercent(profile: {
  business_name?: string | null;
  description: string | null;
  logo_url: string | null;
  website: string | null;
} | null) {
  if (!profile) return { missing: ["profile"], percent: 0 };
  const checks = [
    ["logo", profile.logo_url],
    ["website", profile.website],
    ["description", profile.description],
  ] as const;
  const missing = checks
    .filter(([, value]) => !value || (typeof value === "string" && !value.trim()))
    .map(([key]) => key);
  return {
    missing,
    percent: Math.round(((checks.length - missing.length) / checks.length) * 100),
  };
}

export function formatMoney(value: string | number, asset: "USDC" | "EURC" = "USDC") {
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return asset === "EURC" ? "€0.00" : "$0.00";
  const prefix = asset === "EURC" ? "€" : "$";
  return `${prefix}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
