/**
 * SaphraONE's own transaction confirmation for Google and email (Circle
 * user-controlled) wallets. Shared by the browser and the server.
 *
 * Off unless NEXT_PUBLIC_TX_APPROVAL=true. Turn it on in an environment
 * before switching off Circle's confirmation UI for that environment
 * (Circle Console → Configurator → Wallet Security Settings), never after:
 * in between, payments would have no confirmation at all.
 */

/** Circle calls that move money or sign, and so need an approval. */
export const txApprovalActions = new Set([
  "createContractExecution",
  "createTransfer",
  "signTypedData",
]);

/** The browser's view of the flag (inlined at build). */
export function txApprovalEnabledInBrowser() {
  return process.env.NEXT_PUBLIC_TX_APPROVAL === "true";
}

/** The server's view, read at request time. */
export function txApprovalEnabledOnServer() {
  return process.env["NEXT_PUBLIC_TX_APPROVAL"]?.trim() === "true";
}

/** One Circle call, as the browser is about to send it. */
export type TxCall = {
  action: string;
  amount?: string;
  blockchain?: string;
  callData?: string;
  contractAddress?: string;
  data?: string;
  destinationAddress?: string;
  tokenAddress?: string;
  tokenId?: string;
  walletId: string;
};

/**
 * A few calls approved together (a send's approve + send, a swap's approve +
 * swap), described up front. The server decodes each call and refuses any
 * that doesn't fit: a send's recipient and amount must match.
 */
export type TxGroupIntent = {
  amount: string;
  destination?: string;
  kind: "flow" | "send" | "swap";
  maxUses: number;
  /** A flow: everyone it may pay (fee wallets included). Payments to anyone else are refused. */
  recipients?: string[];
  title: string;
  token: string;
  walletId: string;
};

export type TxApprovalMethod = "passkey" | "pin" | "totp";

/** What /api/tx-approval "begin" returns. */
export type TxApprovalStart = {
  amount: string | null;
  destination: string | null;
  emailHint: string | null;
  expiresAt: string;
  id: string;
  methods: TxApprovalMethod[];
  needsEmailCode: boolean;
  /** No PIN, passkey or 2FA yet: create a PIN first. */
  needsSetup: boolean;
  passkeyOptions: unknown;
  title: string;
  token: string | null;
};

export function pickTxCall(action: string, params: Record<string, unknown>): TxCall {
  const text = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  return {
    action,
    amount: text("amount"),
    blockchain: text("blockchain"),
    callData: text("callData"),
    contractAddress: text("contractAddress"),
    data: text("data"),
    destinationAddress: text("destinationAddress"),
    tokenAddress: text("tokenAddress"),
    tokenId: text("tokenId"),
    walletId: text("walletId") ?? "",
  };
}
