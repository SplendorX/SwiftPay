-- SwiftPay real traction telemetry.
-- Stores product events used for MAU, volume, AUM/TVL, transaction count,
-- retention, payment reliability, and feature usage reporting.

create extension if not exists pgcrypto;

create table if not exists public.traction_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  wallet_address text,
  circle_social_uuid text,
  session_id text,
  source text,
  chain_id integer,
  currency text,
  amount_numeric numeric,
  tx_hash text,
  metadata jsonb not null default '{}'::jsonb,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint traction_events_actor_check check (
    wallet_address is not null
    or circle_social_uuid is not null
    or session_id is not null
  ),
  constraint traction_events_amount_check check (
    amount_numeric is null or amount_numeric >= 0
  )
);

create index if not exists traction_events_created_idx
  on public.traction_events (created_at desc);

create index if not exists traction_events_type_created_idx
  on public.traction_events (event_type, created_at desc);

create index if not exists traction_events_wallet_created_idx
  on public.traction_events (wallet_address, created_at desc)
  where wallet_address is not null;

create index if not exists traction_events_session_created_idx
  on public.traction_events (session_id, created_at desc)
  where session_id is not null;

create index if not exists traction_events_currency_created_idx
  on public.traction_events (currency, created_at desc)
  where currency is not null;

create index if not exists traction_events_tx_hash_idx
  on public.traction_events (tx_hash)
  where tx_hash is not null;

create index if not exists traction_events_metadata_gin_idx
  on public.traction_events using gin (metadata);

alter table public.traction_events enable row level security;

grant select, insert, update, delete on public.traction_events to service_role;

drop policy if exists traction_events_no_client_access on public.traction_events;
create policy traction_events_no_client_access
  on public.traction_events
  for all
  using (false)
  with check (false);
