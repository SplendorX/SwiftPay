-- SwiftPay Agent Wallets — one Circle developer-controlled wallet per user.
-- Holds only delegated funds. Never has access to the user's primary wallet.
-- Idempotent: safe to re-run on existing databases.

create table if not exists public.agent_wallet_configs (
  owner_wallet text primary key,
  wallet_set_id text not null,
  wallet_id text not null,
  wallet_address text not null,
  blockchain text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_wallet_configs_status_check
    check (status in ('active', 'paused', 'revoked'))
);

create unique index if not exists agent_wallet_configs_wallet_id_uidx
  on public.agent_wallet_configs (wallet_id);

create index if not exists agent_wallet_configs_status_idx
  on public.agent_wallet_configs (status);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.agent_wallet_configs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_wallet_configs_touch_updated_at
  on public.agent_wallet_configs;
create trigger agent_wallet_configs_touch_updated_at
  before update on public.agent_wallet_configs
  for each row execute function public.agent_wallet_configs_touch_updated_at();

-- ─── Access ──────────────────────────────────────────────────────────────────
-- RLS on with no permissive policies. Only the server-side service-role client
-- reads or writes these rows, after authorizing the owner wallet.

alter table public.agent_wallet_configs enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.agent_wallet_configs to service_role;
