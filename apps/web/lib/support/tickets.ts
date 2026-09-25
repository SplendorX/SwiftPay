// Server-only. Support requests handed from the help assistant to a person.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { assertRecurringAccess, normalizeOwnerWallet } from "@/lib/recurring-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { categoryFor, isUrgentMessage } from "@/lib/support/match";

const ticketsTable = "support_tickets";
const messagesTable = "support_messages";
const maxTicketsPerDay = 5;
const maxTranscriptEntries = 20;

export class SupportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type SupportTicket = {
  id: string;
  reference: string;
  wallet_address: string | null;
  email: string | null;
  access_token_hash: string;
  subject: string;
  category: string;
  priority: "normal" | "high" | "urgent";
  status: "open" | "waiting_on_customer" | "resolved";
  page_path: string | null;
  last_message_at: string;
  unread_by_customer: boolean;
  created_at: string;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  sender: "customer" | "agent" | "assistant" | "system";
  body: string;
  created_at: string;
};

const db = () => createSupabaseAdminClient();
const nowIso = () => new Date().toISOString();

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(token: unknown, hash: string) {
  if (typeof token !== "string" || !token) return false;
  const given = Buffer.from(hashToken(token));
  const stored = Buffer.from(hash);
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/** SP-7Q3K9: short enough to read out, no 0/O or 1/I to confuse. */
function newReference() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(5);
  return `SP-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readSetupError(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  if (error.code === "42501") {
    return new SupportError("Support isn't switched on yet: run the GRANTs at the end of support-chat.sql.", 503);
  }
  if (error.code === "42P01" || /support_(tickets|messages)/.test(error.message ?? "")) {
    return new SupportError("Support isn't switched on yet: run packages/database/supabase/support-chat.sql.", 503);
  }
  return new SupportError(error.message ?? "Support is unavailable right now.", 500);
}

/** The signed-in wallet, only when this browser has proven it controls it. */
export async function verifiedWallet(ownerWallet: unknown, circleSocialUuid: unknown) {
  const wallet = normalizeOwnerWallet(ownerWallet);
  if (!wallet) return null;
  return (await assertRecurringAccess({ circleSocialUuid, ownerWallet: wallet })) ? wallet : null;
}

// ── Customer ────────────────────────────────────────────────────────────────

export async function createTicket(input: {
  wallet: string | null;
  email: unknown;
  subject: unknown;
  message: unknown;
  transcript: unknown;
  pagePath: unknown;
}) {
  const message = text(input.message, 4000);
  if (message.length < 5) throw new SupportError("Tell us a little more about what's wrong.");
  const email = text(input.email, 160).toLowerCase();
  if (!input.wallet && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SupportError("Add an email so we can reply to you.");
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db()
    .from(ticketsTable)
    .select("id", { count: "exact", head: true })
    .eq(input.wallet ? "wallet_address" : "email", input.wallet ?? email)
    .gte("created_at", since);
  const setup = readSetupError(recent.error);
  if (setup) throw setup;
  if ((recent.count ?? 0) >= maxTicketsPerDay) {
    throw new SupportError("You've opened several requests today — we'll reply to those first.", 429);
  }

  const transcript = Array.isArray(input.transcript)
    ? input.transcript
        .slice(-maxTranscriptEntries)
        .flatMap((entry) => {
          const item = entry as { sender?: unknown; body?: unknown } | null;
          const body = text(item?.body, 1000);
          const sender = item?.sender === "customer" ? "customer" : "assistant";
          return body ? [{ body, sender }] : [];
        })
    : [];

  // The form is prefilled with the customer's last question, which the chat
  // transcript already ends with — keep it once, as their message.
  const same = (a: string, b: string) => a.replace(/\s+/g, " ").toLowerCase() === b.replace(/\s+/g, " ").toLowerCase();
  const lastCustomer = [...transcript].reverse().find((entry) => entry.sender === "customer");
  if (lastCustomer && same(lastCustomer.body, message)) {
    transcript.splice(transcript.lastIndexOf(lastCustomer), 1);
  }

  const everything = `${message} ${transcript.map((entry) => entry.body).join(" ")}`;
  const urgent = isUrgentMessage(everything);
  const subject = text(input.subject, 120) || message.slice(0, 80);
  const token = randomBytes(24).toString("base64url");

  const ticket = await db()
    .from(ticketsTable)
    .insert({
      access_token_hash: hashToken(token),
      category: categoryFor(everything),
      email: email || null,
      page_path: text(input.pagePath, 200) || null,
      priority: urgent ? "urgent" : "normal",
      reference: newReference(),
      subject,
      wallet_address: input.wallet,
    })
    .select("*")
    .single();
  const ticketError = readSetupError(ticket.error);
  if (ticketError) throw ticketError;
  const created = ticket.data as SupportTicket;

  // The assistant conversation first, so the agent needn't ask again.
  const rows = [
    ...transcript.map((entry) => ({ body: entry.body, sender: entry.sender, ticket_id: created.id })),
    { body: message, sender: "customer", ticket_id: created.id },
    {
      body: urgent
        ? "Marked urgent: money or account access may be at risk. We prioritise these."
        : "Thanks — a member of the SwiftPay team will reply here, usually within one business day.",
      sender: "system",
      ticket_id: created.id,
    },
  ];
  await db().from(messagesTable).insert(rows);

  return { reference: created.reference, ticketId: created.id, token, urgent };
}

type Access = { wallet: string | null; token?: unknown };

async function loadAccessible(ticketId: string, access: Access) {
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new SupportError("Request not found.", 404);
  const found = await db().from(ticketsTable).select("*").eq("id", ticketId).maybeSingle();
  const setup = readSetupError(found.error);
  if (setup) throw setup;
  const ticket = found.data as SupportTicket | null;
  const allowed =
    ticket &&
    ((access.wallet && ticket.wallet_address === access.wallet) || tokenMatches(access.token, ticket.access_token_hash));
  // Same answer whether it doesn't exist or isn't theirs.
  if (!ticket || !allowed) throw new SupportError("Request not found.", 404);
  return ticket;
}

function summary(ticket: SupportTicket) {
  return {
    category: ticket.category,
    createdAt: ticket.created_at,
    id: ticket.id,
    lastMessageAt: ticket.last_message_at,
    priority: ticket.priority,
    reference: ticket.reference,
    status: ticket.status,
    subject: ticket.subject,
    unread: ticket.unread_by_customer,
  };
}

export async function listTickets(input: { wallet: string | null; tokens: unknown }) {
  const byToken = Array.isArray(input.tokens)
    ? input.tokens
        .slice(0, 25)
        .map((entry) => entry as { id?: unknown; token?: unknown })
        .filter((entry) => typeof entry.id === "string" && typeof entry.token === "string")
    : [];

  const results = new Map<string, SupportTicket>();
  if (input.wallet) {
    const mine = await db()
      .from(ticketsTable)
      .select("*")
      .eq("wallet_address", input.wallet)
      .order("last_message_at", { ascending: false })
      .limit(25);
    const setup = readSetupError(mine.error);
    if (setup) throw setup;
    for (const ticket of (mine.data ?? []) as SupportTicket[]) results.set(ticket.id, ticket);
  }
  if (byToken.length > 0) {
    const guest = await db()
      .from(ticketsTable)
      .select("*")
      .in("id", byToken.map((entry) => entry.id as string));
    for (const ticket of (guest.data ?? []) as SupportTicket[]) {
      const entry = byToken.find((candidate) => candidate.id === ticket.id);
      if (entry && tokenMatches(entry.token, ticket.access_token_hash)) results.set(ticket.id, ticket);
    }
  }

  return [...results.values()]
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    .map(summary);
}

export async function readThread(ticketId: string, access: Access) {
  const ticket = await loadAccessible(ticketId, access);
  const messages = await db()
    .from(messagesTable)
    .select("*")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });
  if (ticket.unread_by_customer) {
    await db().from(ticketsTable).update({ unread_by_customer: false }).eq("id", ticket.id);
  }
  return {
    messages: ((messages.data ?? []) as SupportMessage[]).map((message) => ({
      body: message.body,
      createdAt: message.created_at,
      id: message.id,
      sender: message.sender,
    })),
    ticket: { ...summary(ticket), unread: false },
  };
}

export async function addCustomerMessage(ticketId: string, access: Access, body: unknown) {
  const ticket = await loadAccessible(ticketId, access);
  const message = text(body, 4000);
  if (!message) throw new SupportError("Write a message first.");
  await db().from(messagesTable).insert({ body: message, sender: "customer", ticket_id: ticket.id });
  await db()
    .from(ticketsTable)
    .update({
      last_message_at: nowIso(),
      // A reply reopens a resolved request; an urgent word raises it.
      priority: isUrgentMessage(message) ? "urgent" : ticket.priority,
      status: "open",
      updated_at: nowIso(),
    })
    .eq("id", ticket.id);
  return readThread(ticket.id, access);
}

// ── Support team ────────────────────────────────────────────────────────────

const priorityRank = { urgent: 0, high: 1, normal: 2 } as const;

export async function listQueue(status: "open" | "waiting_on_customer" | "resolved" | "all") {
  let query = db().from(ticketsTable).select("*").order("last_message_at", { ascending: false }).limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  const setup = readSetupError(error);
  if (setup) throw setup;
  return ((data ?? []) as SupportTicket[])
    .sort((a, b) =>
      status === "open"
        ? priorityRank[a.priority] - priorityRank[b.priority] || a.last_message_at.localeCompare(b.last_message_at)
        : 0,
    )
    .map((ticket) => ({ ...summary(ticket), email: ticket.email, pagePath: ticket.page_path, wallet: ticket.wallet_address }));
}

export async function readThreadForAgent(ticketId: string) {
  const found = await db().from(ticketsTable).select("*").eq("id", ticketId).maybeSingle();
  const ticket = found.data as SupportTicket | null;
  if (!ticket) throw new SupportError("Request not found.", 404);
  const messages = await db()
    .from(messagesTable)
    .select("*")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });
  return {
    messages: ((messages.data ?? []) as SupportMessage[]).map((message) => ({
      body: message.body,
      createdAt: message.created_at,
      id: message.id,
      sender: message.sender,
    })),
    ticket: { ...summary(ticket), email: ticket.email, pagePath: ticket.page_path, wallet: ticket.wallet_address },
  };
}

export async function agentUpdate(ticketId: string, input: { body?: unknown; status?: unknown; priority?: unknown }) {
  const found = await db().from(ticketsTable).select("id").eq("id", ticketId).maybeSingle();
  if (!found.data) throw new SupportError("Request not found.", 404);

  const reply = text(input.body, 4000);
  const status =
    input.status === "open" || input.status === "waiting_on_customer" || input.status === "resolved"
      ? input.status
      : reply
        ? "waiting_on_customer"
        : undefined;
  const priority =
    input.priority === "normal" || input.priority === "high" || input.priority === "urgent" ? input.priority : undefined;

  if (reply) await db().from(messagesTable).insert({ body: reply, sender: "agent", ticket_id: ticketId });
  await db()
    .from(ticketsTable)
    .update({
      ...(priority ? { priority } : {}),
      ...(status ? { status } : {}),
      ...(reply ? { last_message_at: nowIso(), unread_by_customer: true } : {}),
      updated_at: nowIso(),
    })
    .eq("id", ticketId);
  return readThreadForAgent(ticketId);
}
