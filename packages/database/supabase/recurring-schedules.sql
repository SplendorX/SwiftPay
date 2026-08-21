-- SwiftRecurepay schedules + autonomous Autopay occurrences.
-- Idempotent: safe to re-run on existing databases.

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

-- ─── Autonomous Autopay columns (additive) ───────────────────────────────────

alter table public.recurring_schedules
  add column if not exists autopay_enabled boolean not null default false;

alter table public.recurring_schedules
  add column if not exists authorization_status text not null default 'UNAUTHORIZED';

alter table public.recurring_schedules
  add column if not exists authorization_tx_hash text;

alter table public.recurring_schedules
  add column if not exists authorized_at timestamptz;

alter table public.recurring_schedules
  add column if not exists authorization_expires_at timestamptz;

alter table public.recurring_schedules
  add column if not exists authorized_recipient text;

alter table public.recurring_schedules
  add column if not exists authorized_token text;

alter table public.recurring_schedules
  add column if not exists max_payment_amount text;

alter table public.recurring_schedules
  add column if not exists max_payment_amount_units text;

alter table public.recurring_schedules
  add column if not exists total_limit text;

alter table public.recurring_schedules
  add column if not exists total_limit_units text;

alter table public.recurring_schedules
  add column if not exists executed_amount_units text not null default '0';

alter table public.recurring_schedules
  add column if not exists last_execution_id uuid;

alter table public.recurring_schedules
  add column if not exists last_executed_at timestamptz;

alter table public.recurring_schedules
  add column if not exists failure_count integer not null default 0;

alter table public.recurring_schedules
  add column if not exists max_retries integer not null default 4;

alter table public.recurring_schedules
  add column if not exists next_occurrence_number integer not null default 1;

alter table public.recurring_executions
  add column if not exists occurrence_number integer;

alter table public.recurring_executions
  add column if not exists amount text;

alter table public.recurring_executions
  add column if not exists amount_units text;

alter table public.recurring_executions
  add column if not exists execution_mode text not null default 'manual';

alter table public.recurring_executions
  add column if not exists provider_transaction_id text;

alter table public.recurring_executions
  add column if not exists attempt_count integer not null default 0;

alter table public.recurring_executions
  add column if not exists next_retry_at timestamptz;

alter table public.recurring_executions
  add column if not exists submitted_at timestamptz;

alter table public.recurring_executions
  add column if not exists confirmed_at timestamptz;

alter table public.recurring_executions
  add column if not exists updated_at timestamptz not null default now();

alter table public.recurring_executions
  add column if not exists lock_token text;

alter table public.recurring_executions
  add column if not exists lock_expires_at timestamptz;

-- Existing autopay_enabled rows are NOT treated as authorized.
update public.recurring_schedules
set authorization_status = 'REAUTHORIZATION_REQUIRED',
    updated_at = now()
where autopay_enabled = true
  and authorization_status in ('UNAUTHORIZED', 'REAUTHORIZATION_REQUIRED')
  and authorization_tx_hash is null
  and authorized_at is null;

-- Backfill occurrence numbers for legacy rows (stable by created_at).
with numbered as (
  select
    id,
    row_number() over (partition by schedule_id order by created_at asc) as n
  from public.recurring_executions
  where occurrence_number is null
)
update public.recurring_executions e
set occurrence_number = numbered.n
from numbered
where e.id = numbered.id;

create unique index if not exists recurring_executions_occurrence_uidx
  on public.recurring_executions (schedule_id, occurrence_number)
  where occurrence_number is not null;

create unique index if not exists recurring_executions_idempotency_uidx
  on public.recurring_executions (idempotency_key);

create index if not exists recurring_schedules_owner_wallet_idx
  on public.recurring_schedules (owner_wallet);

create index if not exists recurring_schedules_due_idx
  on public.recurring_schedules (status, next_run_at);

create index if not exists recurring_schedules_autopay_due_idx
  on public.recurring_schedules (status, autopay_enabled, authorization_status, next_run_at);

create index if not exists recurring_executions_owner_wallet_idx
  on public.recurring_executions (owner_wallet, created_at desc);

create index if not exists recurring_executions_schedule_idx
  on public.recurring_executions (schedule_id, due_at desc);

create index if not exists recurring_executions_worker_idx
  on public.recurring_executions (status, next_retry_at, created_at);

create table if not exists public.recurring_locks (
  lock_key text primary key,
  owner_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists recurring_locks_expires_idx
  on public.recurring_locks (expires_at);

alter table public.recurring_schedules enable row level security;
alter table public.recurring_executions enable row level security;
alter table public.recurring_locks enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.recurring_schedules to service_role;
grant select, insert, update, delete on public.recurring_executions to service_role;
grant select, insert, update, delete on public.recurring_locks to service_role;
