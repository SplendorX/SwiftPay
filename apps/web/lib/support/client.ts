"use client";

/**
 * Browser side of SwiftPay Support. Signed-in customers are recognised by
 * their wallet session; a guest's requests are reachable only through the
 * private tokens kept here, in their own browser.
 */
export type SupportTicketSummary = {
  id: string;
  reference: string;
  subject: string;
  category: string;
  priority: "normal" | "high" | "urgent";
  status: "open" | "waiting_on_customer" | "resolved";
  createdAt: string;
  lastMessageAt: string;
  unread: boolean;
};

export type SupportThreadMessage = {
  id: string;
  sender: "customer" | "agent" | "assistant" | "system";
  body: string;
  createdAt: string;
};

export type SupportIdentity = { ownerWallet?: string | null; circleSocialUuid?: string | null };

const storageKey = "swiftpay:support-tickets";
export const supportChangedEvent = "swiftpay:support-changed";

type StoredTicket = { id: string; token: string; reference: string };

export function readStoredTickets(): StoredTicket[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.id && entry?.token) : [];
  } catch {
    return [];
  }
}

function storeTicket(ticket: StoredTicket) {
  try {
    const next = [ticket, ...readStoredTickets().filter((entry) => entry.id !== ticket.id)].slice(0, 25);
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Private mode: the ticket still exists; a signed-in customer finds it by wallet.
  }
}

function tokenFor(id: string) {
  return readStoredTickets().find((entry) => entry.id === id)?.token;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? "Support is unavailable right now.");
  return payload as T;
}

function identity(input: SupportIdentity) {
  return {
    circleSocialUuid: input.circleSocialUuid ?? undefined,
    ownerWallet: input.ownerWallet ?? undefined,
  };
}

export async function openSupportTicket(
  input: SupportIdentity & {
    email?: string;
    subject: string;
    message: string;
    transcript: { sender: "customer" | "assistant"; body: string }[];
    pagePath: string;
  },
) {
  const created = await post<{ reference: string; ticketId: string; token: string; urgent: boolean }>(
    "/api/support/tickets",
    {
      ...identity(input),
      email: input.email,
      message: input.message,
      pagePath: input.pagePath,
      subject: input.subject,
      transcript: input.transcript,
    },
  );
  storeTicket({ id: created.ticketId, reference: created.reference, token: created.token });
  window.dispatchEvent(new Event(supportChangedEvent));
  return created;
}

export async function listSupportTickets(input: SupportIdentity) {
  const payload = await post<{ tickets: SupportTicketSummary[] }>("/api/support/tickets/list", {
    ...identity(input),
    tokens: readStoredTickets().map(({ id, token }) => ({ id, token })),
  });
  return payload.tickets;
}

export async function readSupportThread(id: string, input: SupportIdentity) {
  return post<{ ticket: SupportTicketSummary; messages: SupportThreadMessage[] }>(
    `/api/support/tickets/${id}`,
    { ...identity(input), action: "read", token: tokenFor(id) },
  );
}

export async function replyToSupport(id: string, body: string, input: SupportIdentity) {
  return post<{ ticket: SupportTicketSummary; messages: SupportThreadMessage[] }>(
    `/api/support/tickets/${id}`,
    { ...identity(input), action: "reply", body, token: tokenFor(id) },
  );
}
