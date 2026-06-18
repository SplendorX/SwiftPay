const usernamePattern = /^[a-z][a-z0-9_]{2,19}$/;

const reservedUsernames = new Set([
  "admin",
  "api",
  "help",
  "root",
  "settings",
  "support",
  "swiftpay",
  "wallet",
]);

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string) {
  const username = normalizeUsername(value);

  if (!usernamePattern.test(username)) {
    return "Usernames must be 3-20 characters, start with a letter, and use only lowercase letters, numbers, or underscores.";
  }

  if (reservedUsernames.has(username)) {
    return "That username is reserved.";
  }

  return null;
}

export function buildUsernameCandidate(walletAddress: string, attempt = 0) {
  const suffix = walletAddress.replace(/^0x/i, "").slice(-6).toLowerCase();

  if (attempt === 0) {
    return `swift_${suffix}`;
  }

  return `swift_${suffix}_${attempt}`;
}

export function formatUsernameLabel(username: string) {
  return `@${normalizeUsername(username)}`;
}

export type ParsedRecipientInput =
  | { kind: "address"; address: string }
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "username"; username: string };

export function parseRecipientInput(value: string): ParsedRecipientInput {
  const trimmed = value.trim();

  if (!trimmed) {
    return { kind: "empty" };
  }

  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    return { kind: "invalid", message: "Enter a valid wallet address." };
  }

  const username = normalizeUsername(trimmed.replace(/^@+/, ""));
  const validationError = validateUsername(username);

  if (validationError) {
    return { kind: "invalid", message: validationError };
  }

  return { kind: "username", username };
}