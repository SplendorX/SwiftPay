import { getAddress, isAddress, parseUnits, type Address } from "viem";

import { fetchProfileByUsername } from "@/lib/profile";
import { formatUsernameLabel, parseRecipientInput } from "@/lib/profile-utils";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";

export type BatchPayeeImport = {
  amount: string;
  note?: string;
  query: string;
};

export type ResolvedBatchPayee = {
  address: Address;
  amount: string;
  amountUnits: bigint;
  avatarUrl?: string | null;
  displayName?: string | null;
  id: string;
  label?: string;
  line: number;
  query: string;
  username?: string;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

export function parseBatchImportText(input: string): BatchPayeeImport[] {
  const rows: BatchPayeeImport[] = [];

  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const columns = line.includes(",")
        ? parseCsvLine(line)
        : line.split(/\s+/).map((part) => part.trim());
      if (columns.length < 2) return;

      const [query, amount, ...noteParts] = columns;
      const looksLikeHeader =
        index === 0 &&
        /address|wallet|recipient|username|user|handle/i.test(query) &&
        /amount|value|sum/i.test(amount);
      if (looksLikeHeader || !query || !amount) return;

      rows.push({
        amount,
        note: noteParts.join(" ").trim() || undefined,
        query,
      });
    });

  return rows;
}

export async function resolvePayeeQuery(query: string) {
  const parsed = parseRecipientInput(query);

  if (parsed.kind === "empty") {
    return null;
  }

  if (parsed.kind === "invalid") {
    throw new Error(parsed.message);
  }

  if (parsed.kind === "address") {
    return {
      address: getAddress(parsed.address) as Address,
      avatarUrl: null,
      displayName: null,
      username: undefined,
    };
  }

  const profile = await fetchProfileByUsername(parsed.username);
  if (!profile || !isAddress(profile.wallet_address)) {
    throw new Error(`${formatUsernameLabel(parsed.username)} was not found.`);
  }

  return {
    address: getAddress(profile.wallet_address) as Address,
    avatarUrl: profile.avatar_url,
    displayName: profile.display_name,
    username: profile.username,
  };
}

export function parseAmountUnits(amount: string, token: ArcTokenSymbol) {
  const decimals = arcTestnetTokens[token].decimals;
  try {
    const units = parseUnits(amount.trim(), decimals);
    if (units <= BigInt(0)) return null;
    return units;
  } catch {
    return null;
  }
}

export function splitEvenAmounts(total: string, count: number, token: ArcTokenSymbol) {
  if (count <= 0) return [];
  const decimals = arcTestnetTokens[token].decimals;
  let totalUnits: bigint;
  try {
    totalUnits = parseUnits(total.trim(), decimals);
  } catch {
    return [];
  }
  if (totalUnits <= BigInt(0)) return [];

  const base = totalUnits / BigInt(count);
  const remainder = totalUnits % BigInt(count);
  const scale = BigInt(10) ** BigInt(decimals);

  return Array.from({ length: count }, (_, index) => {
    const units = index === count - 1 ? base + remainder : base;
    const whole = units / scale;
    const fraction = units % scale;
    if (fraction === BigInt(0)) return whole.toString();
    const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fractionText}`;
  });
}


