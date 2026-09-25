-- ALLIE monetization — subscriptions, LLM usage accounting, call dedupe cache.
-- ALLIE Pro is itself a SwiftRecurepay schedule: SwiftPay dogfoods its own
-- recurring payment rail for the monthly fee (ALLIE_PRO_MONTHLY_FEE_USDC).
-- Idempotent: safe to re-run on existing databases.

create table if not exists public.allie_subscriptions (
  owner_wallet text primary key,
  tier text not null default 'free',
  subscribed_at timestamptz,
  expires_at timestamptz,
  -- Links to public.recurring_schedules(id) for auto-renewal. Not a FK: a
  -- subscription must survive its schedule being deleted.
  recurring_schedule_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint allie_subscriptions_tier_check check (tier in ('free', 'pro'))
);

create index if not exists allie_subscriptions_active_idx
  on public.allie_subscriptions (tier, expires_at);

create table if not exists public.allie_llm_usage (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  tier integer not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  cost_estimate_usdc numeric(12, 6),
  created_at timestamptz not null default now(),
  constraint allie_llm_usage_tier_check check (tier in (2, 3))
);

-- Daily aggregation for the per-user LLM call budget.
create index if not exists allie_llm_usage_owner_idx
  on public.allie_llm_usage (owner_wallet, created_at desc);

create table if not exists public.allie_llm_cache (
  intent_key text primary key,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

-- Rows live for 60 seconds. Purged on read, and in bulk by this index.
create index if not exists allie_llm_cache_created_idx
  on public.allie_llm_cache (created_at);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.allie_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists allie_subscriptions_touch_updated_at
  on public.allie_subscriptions;
create trigger allie_subscriptions_touch_updated_at
  before update on public.allie_subscriptions
  for each row execute function public.allie_touch_updated_at();

-- ─── Access ──────────────────────────────────────────────────────────────────
-- RLS on with no permissive policies. Billing state is server-side only.

alter table public.allie_subscriptions enable row level security;
alter table public.allie_llm_usage enable row level security;
alter table public.allie_llm_cache enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.allie_subscriptions to service_role;
grant select, insert, update, delete on public.allie_llm_usage to service_role;
grant select, insert, update, delete on public.allie_llm_cache to service_role;
