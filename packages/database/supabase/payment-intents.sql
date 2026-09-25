-- SwiftPay Unified Payment Engine — intent ledger.
-- Every initiator (human, business, ALLIE) writes the same PaymentIntent row.
-- The chain transaction is not the source of truth; this ledger is.
-- Idempotent: safe to re-run on existing databases.

create table if not exists public.payment_intents (
  intent_id uuid primary key default gen_random_uuid(),
  initiator_type text not null,
  initiator_id text not null,
  recipient text not null,
  resolved_recipient text,
  asset text not null default 'USDC',
  -- bigint stored as text to avoid JS precision loss on 6-decimal units.
  amount_units text not null,
  chain_id integer not null,
  rail text,
  metadata jsonb,
  idempotency_key text unique,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint payment_intents_initiator_type_check
    check (initiator_type in ('human', 'business', 'agent')),
  constraint payment_intents_asset_check
    check (asset in ('USDC', 'EURC')),
  constraint payment_intents_status_check
    check (status in (
      'pending', 'policy_check', 'approved', 'rejected', 'executing',
      'submitted', 'confirming', 'completed', 'failed', 'cancelled'
    ))
);

create table if not exists public.payment_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.payment_intents(intent_id) on delete cascade,
  rail text,
  executor text,
  status text not null default 'queued',
  tx_hash text,
  provider_transaction_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_status_check
    check (status in ('queued', 'submitted', 'confirmed', 'failed'))
);

create table if not exists public.payment_settlements (
  settlement_id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.payment_intents(intent_id) on delete cascade,
  attempt_id uuid references public.payment_attempts(attempt_id) on delete set null,
  tx_hash text,
  chain_id integer,
  amount_units text not null,
  fee_units text not null default '0',
  settled_at timestamptz not null default now()
);

create index if not exists payment_intents_initiator_idx
  on public.payment_intents (initiator_id, created_at desc);

create unique index if not exists payment_intents_idempotency_uidx
  on public.payment_intents (idempotency_key)
  where idempotency_key is not null;

create index if not exists payment_intents_status_idx
  on public.payment_intents (status, created_at desc);

create index if not exists payment_attempts_intent_idx
  on public.payment_attempts (intent_id, created_at asc);

create index if not exists payment_settlements_intent_idx
  on public.payment_settlements (intent_id, settled_at asc);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.payment_engine_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payment_intents_touch_updated_at on public.payment_intents;
create trigger payment_intents_touch_updated_at
  before update on public.payment_intents
  for each row execute function public.payment_engine_touch_updated_at();

drop trigger if exists payment_attempts_touch_updated_at on public.payment_attempts;
create trigger payment_attempts_touch_updated_at
  before update on public.payment_attempts
  for each row execute function public.payment_engine_touch_updated_at();

-- ─── Access ──────────────────────────────────────────────────────────────────
-- RLS on with no permissive policies: anon/authenticated are denied outright.
-- All reads and writes go through the server-side service-role admin client,
-- which bypasses RLS after the API route has authorized the caller's wallet.

alter table public.payment_intents enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_settlements enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.payment_intents to service_role;
grant select, insert, update, delete on public.payment_attempts to service_role;
grant select, insert, update, delete on public.payment_settlements to service_role;
