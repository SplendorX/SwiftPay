-- SwiftPay Policy Engine — per-wallet spend policy.
-- Evaluated for every PaymentIntent before it reaches the router.
-- Idempotent: safe to re-run on existing databases.

create table if not exists public.payment_policies (
  owner_wallet text primary key,
  -- bigint stored as text to avoid JS precision loss on 6-decimal units.
  per_tx_limit_units text not null default '25000000',
  daily_limit_units text not null default '100000000',
  approved_recipients jsonb not null default '[]'::jsonb,
  approved_assets jsonb not null default '["USDC"]'::jsonb,
  requires_approval_above_units text not null default '10000000',
  status text not null default 'active',
  -- IANA zone; the daily limit resets at the owner's local midnight.
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_policies_status_check
    check (status in ('active', 'paused', 'revoked'))
);

alter table public.payment_policies
  add column if not exists timezone text not null default 'UTC';

create index if not exists payment_policies_status_idx
  on public.payment_policies (status);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.payment_policies_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payment_policies_touch_updated_at on public.payment_policies;
create trigger payment_policies_touch_updated_at
  before update on public.payment_policies
  for each row execute function public.payment_policies_touch_updated_at();

-- ─── Access ──────────────────────────────────────────────────────────────────
-- RLS on with no permissive policies: the policy row is only reachable through
-- the server-side service-role client, after the route authorizes the owner.

alter table public.payment_policies enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.payment_policies to service_role;
