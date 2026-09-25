-- SwiftPay account activity ledger.
-- One row per confirmed transaction a feature performed from the browser
-- (Send, Request Payment, Swap, BatchPay, Circle, RecurePay, invoice payers).
-- Server-side features (Save, Earn, Payroll, Invoices received, ALLIE,
-- RecurePay autopay) are read from their own tables by /api/activity, so they
-- do not need to write here.

create extension if not exists pgcrypto;

create table if not exists public.account_activity (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  source text not null,
  direction text not null default 'out',
  title text,
  counterparty text,
  amount text,
  token text,
  tx_hash text,
  -- Mirrored rows are written for the other side of a payment (the requester
  -- of a paid request). They only ever label an on-chain transfer the
  -- dashboard already sees; they are never shown on their own.
  mirrored boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint account_activity_source_check check (
    source in (
      'send', 'request', 'payroll', 'circle', 'swap', 'invoice',
      'save', 'earn', 'batch', 'recurepay', 'agent'
    )
  ),
  constraint account_activity_direction_check check (
    direction in ('in', 'out', 'internal')
  )
);

-- One row per (wallet, feature, transaction). Deliberately NOT a partial
-- index: the app upserts with ON CONFLICT (wallet_address, source, tx_hash),
-- which Postgres can only match to a partial index if the query repeats its
-- WHERE clause, and the Supabase client cannot. NULL tx_hash values are still
-- distinct, so rows without a hash never collide.
drop index if exists public.account_activity_wallet_source_tx_unique;
create unique index account_activity_wallet_source_tx_unique
  on public.account_activity (wallet_address, source, tx_hash);

create index if not exists account_activity_wallet_occurred_idx
  on public.account_activity (wallet_address, occurred_at desc);

alter table public.account_activity enable row level security;

grant select, insert, update, delete on public.account_activity to service_role;

drop policy if exists account_activity_no_client_access on public.account_activity;
create policy account_activity_no_client_access
  on public.account_activity
  for all
  using (false)
  with check (false);
