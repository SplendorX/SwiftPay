-- SwiftPay Support: conversations handed from the help assistant to a person.
--
-- The assistant answers from a curated help library at no cost; when it
-- can't, the customer opens a request that lands in /admin/support.
-- Signed-in customers are identified by wallet; guests (e.g. invoice payers)
-- by an email plus a private access token only their browser holds.
--
-- Run in the Supabase SQL editor. Safe to run more than once.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  -- Short, human-friendly reference: SP-7Q3K9.
  reference text not null unique,
  wallet_address text,
  email text,
  -- sha256 of the guest's access token; the token itself is never stored.
  access_token_hash text not null,
  subject text not null,
  category text not null default 'general',
  priority text not null default 'normal',
  status text not null default 'open',
  -- Where the customer was when they asked (e.g. /invoice/…), for context.
  page_path text,
  last_message_at timestamptz not null default now(),
  -- Set when support replies and the customer hasn't read it yet.
  unread_by_customer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_identity check (wallet_address is not null or email is not null),
  constraint support_tickets_priority_check check (priority in ('normal', 'high', 'urgent')),
  constraint support_tickets_status_check check (status in ('open', 'waiting_on_customer', 'resolved'))
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_messages_sender_check check (sender in ('customer', 'agent', 'assistant', 'system')),
  constraint support_messages_body_len check (char_length(body) between 1 and 4000)
);

create index if not exists support_tickets_wallet_idx
  on public.support_tickets (wallet_address, last_message_at desc);
create index if not exists support_tickets_queue_idx
  on public.support_tickets (status, priority, last_message_at desc);
create index if not exists support_messages_ticket_idx
  on public.support_messages (ticket_id, created_at);

-- Server-only tables: the service role reads and writes them.
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

grant all privileges on table public.support_tickets to postgres, service_role;
grant all privileges on table public.support_messages to postgres, service_role;
