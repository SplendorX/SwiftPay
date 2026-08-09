-- SwiftPay Earn indexing tables (backend analytics only — not financial source of truth).
-- On-chain vault shares / assets remain authoritative.

create table if not exists public.earn_vaults (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  vault_address text not null,
  strategy_address text,
  aave_pool_address text,
  atoken_address text,
  usdc_address text not null,
  earn_mode text not null default 'unavailable', -- live | simulation | unavailable
  is_simulation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, vault_address)
);

create table if not exists public.earn_deposits (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  vault_address text not null,
  wallet_address text not null,
  assets text not null, -- decimal string, never float
  shares text not null,
  tx_hash text not null,
  block_number bigint,
  log_index integer,
  timestamp timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

create table if not exists public.earn_withdrawals (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  vault_address text not null,
  wallet_address text not null,
  assets text not null,
  shares text not null,
  tx_hash text not null,
  block_number bigint,
  log_index integer,
  timestamp timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

create table if not exists public.earn_fee_events (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  vault_address text not null,
  gross_yield text not null,
  fee text not null,
  tx_hash text,
  block_number bigint,
  timestamp timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.earn_apy_snapshots (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  strategy_address text not null,
  gross_apy_bps integer, -- null when unavailable
  net_apy_bps integer,
  underlying_apy_bps integer,
  data_source text not null, -- aave_liquidity_index | observed_growth | unavailable
  is_estimate boolean not null default true,
  is_simulation boolean not null default false,
  captured_at timestamptz not null default now()
);

create table if not exists public.earn_auto_save_rules (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null unique,
  enabled boolean not null default false,
  min_idle_balance text not null default '100',
  save_amount text not null default '50',
  frequency text not null default 'weekly', -- daily | weekly | monthly
  auto_sweep_enabled boolean not null default false,
  auto_sweep_keep_balance text not null default '500',
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_skip_reason text,
  authorization_accepted boolean not null default false,
  authorization_note text,
  usdc_allowance_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.earn_auto_save_executions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.earn_auto_save_rules(id) on delete set null,
  owner_wallet text not null,
  amount text not null,
  amount_units text not null,
  status text not null default 'pending',
  -- pending | awaiting_wallet | awaiting_allowance | executed | skipped | failed
  skip_reason text,
  tx_hash text,
  idempotency_key text unique,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.earn_index_cursors (
  chain_id integer not null,
  vault_address text not null,
  last_block text not null default '0',
  updated_at timestamptz not null default now(),
  primary key (chain_id, vault_address)
);

create table if not exists public.earn_notifications (
  id uuid primary key default gen_random_uuid(),
  wallet_address text,
  kind text not null,
  title text not null,
  body text not null,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists earn_deposits_wallet_idx
  on public.earn_deposits (wallet_address, created_at desc);

create index if not exists earn_withdrawals_wallet_idx
  on public.earn_withdrawals (wallet_address, created_at desc);

create index if not exists earn_apy_snapshots_strategy_idx
  on public.earn_apy_snapshots (strategy_address, captured_at desc);

create index if not exists earn_auto_save_owner_idx
  on public.earn_auto_save_rules (owner_wallet);

create index if not exists earn_auto_save_due_idx
  on public.earn_auto_save_rules (enabled, next_run_at);

create index if not exists earn_auto_save_executions_wallet_idx
  on public.earn_auto_save_executions (owner_wallet, created_at desc);

create index if not exists earn_notifications_wallet_idx
  on public.earn_notifications (wallet_address, created_at desc);

alter table public.earn_vaults enable row level security;
alter table public.earn_deposits enable row level security;
alter table public.earn_withdrawals enable row level security;
alter table public.earn_fee_events enable row level security;
alter table public.earn_apy_snapshots enable row level security;
alter table public.earn_auto_save_rules enable row level security;
alter table public.earn_auto_save_executions enable row level security;
alter table public.earn_index_cursors enable row level security;
alter table public.earn_notifications enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.earn_vaults to service_role;
grant select, insert, update, delete on public.earn_deposits to service_role;
grant select, insert, update, delete on public.earn_withdrawals to service_role;
grant select, insert, update, delete on public.earn_fee_events to service_role;
grant select, insert, update, delete on public.earn_apy_snapshots to service_role;
grant select, insert, update, delete on public.earn_auto_save_rules to service_role;
grant select, insert, update, delete on public.earn_auto_save_executions to service_role;
grant select, insert, update, delete on public.earn_index_cursors to service_role;
grant select, insert, update, delete on public.earn_notifications to service_role;

-- Additive migrations for existing installs
alter table public.earn_auto_save_rules
  add column if not exists auto_sweep_enabled boolean not null default false;
alter table public.earn_auto_save_rules
  add column if not exists auto_sweep_keep_balance text not null default '500';
alter table public.earn_auto_save_rules
  add column if not exists authorization_accepted boolean not null default false;
alter table public.earn_auto_save_rules
  add column if not exists usdc_allowance_to text;
