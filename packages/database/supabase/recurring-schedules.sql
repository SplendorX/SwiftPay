create table if not exists public.recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  beneficiary_wallet text not null,
  beneficiary_username text,
  beneficiary_label text,
  token_symbol text not null,
  amount text not null,
  amount_units text not null,
  narration text,
  frequency text not null,
  interval_days integer,
  timezone text not null default 'UTC',
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active',
  wallet_mode text not null,
  autopay_enabled boolean not null default false,
  max_runs integer,
  run_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_executions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.recurring_schedules(id) on delete cascade,
  owner_wallet text not null,
  due_at timestamptz not null,
  status text not null default 'awaiting_wallet',
  tx_hash text,
  error_message text,
  idempotency_key text not null unique,
  attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recurring_schedules_owner_wallet_idx
  on public.recurring_schedules (owner_wallet);

create index if not exists recurring_schedules_due_idx
  on public.recurring_schedules (status, next_run_at);

create index if not exists recurring_executions_owner_wallet_idx
  on public.recurring_executions (owner_wallet, created_at desc);

create index if not exists recurring_executions_schedule_idx
  on public.recurring_executions (schedule_id, due_at desc);

alter table public.recurring_schedules enable row level security;
alter table public.recurring_executions enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.recurring_schedules to service_role;
grant select, insert, update, delete on public.recurring_executions to service_role;

alter table public.recurring_schedules
  add column if not exists autopay_enabled boolean not null default false;