-- SwiftPay Payroll: Business-exclusive financial payroll infrastructure
-- Additive. Run in Supabase SQL editor.
-- Scope: account_id represents the Business account wallet address.

create table if not exists public.payroll_team_members (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  member_type text not null default 'EMPLOYEE',
  full_name text not null,
  email text,
  role text,
  payment_destination_type text not null default 'SWIFTPAY_USER',
  swiftpay_username text,
  wallet_address text not null,
  preferred_asset text not null default 'USDC',
  default_payment_amount text not null default '0',
  payment_frequency text not null default 'MONTHLY',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint payroll_team_members_type_check check (member_type in ('EMPLOYEE', 'CONTRACTOR')),
  constraint payroll_team_members_destination_check check (payment_destination_type in ('SWIFTPAY_USER', 'EXTERNAL_WALLET')),
  constraint payroll_team_members_frequency_check check (payment_frequency in ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'MANUAL')),
  constraint payroll_team_members_status_check check (status in ('ACTIVE', 'PAUSED', 'ARCHIVED'))
);

create index if not exists payroll_team_members_account_idx
  on public.payroll_team_members (account_id, status, created_at desc);

create table if not exists public.payroll_groups (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  name text not null,
  description text,
  default_schedule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_groups_account_idx
  on public.payroll_groups (account_id, created_at desc);

create table if not exists public.payroll_group_members (
  id uuid primary key default gen_random_uuid(),
  payroll_group_id uuid not null references public.payroll_groups(id) on delete cascade,
  team_member_id uuid not null references public.payroll_team_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint payroll_group_members_unique unique (payroll_group_id, team_member_id)
);

create table if not exists public.payroll_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  payroll_group_id uuid references public.payroll_groups(id) on delete set null,
  frequency text not null default 'MONTHLY',
  schedule_config jsonb not null default '{}'::jsonb,
  next_run_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_schedules_frequency_check check (frequency in ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'MANUAL'))
);

create index if not exists payroll_schedules_account_idx
  on public.payroll_schedules (account_id, is_active);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  payroll_group_id uuid references public.payroll_groups(id) on delete set null,
  payroll_schedule_id uuid references public.payroll_schedules(id) on delete set null,
  name text not null,
  source text not null default 'MANUAL',
  status text not null default 'DRAFT',
  asset text not null default 'USDC',
  total_amount text not null default '0',
  total_fees text not null default '0',
  total_required text not null default '0',
  recipient_count integer not null default 0,
  approved_by text,
  approved_at timestamptz,
  approval_metadata jsonb default '{}'::jsonb,
  snapshot jsonb,
  execution_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_runs_source_check check (source in ('MANUAL', 'SCHEDULED')),
  constraint payroll_runs_status_check check (
    status in ('DRAFT', 'READY', 'APPROVED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED')
  )
);

create index if not exists payroll_runs_account_idx
  on public.payroll_runs (account_id, status, created_at desc);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  team_member_id uuid references public.payroll_team_members(id) on delete set null,
  recipient_name_snapshot text not null,
  recipient_destination_snapshot text not null,
  recipient_username_snapshot text,
  base_amount text not null default '0',
  adjustment_amount text not null default '0',
  total_amount text not null default '0',
  asset text not null default 'USDC',
  status text not null default 'PENDING',
  failure_reason text,
  attempt_count integer not null default 0,
  transaction_id text,
  blockchain_tx_hash text,
  settled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_items_status_check check (
    status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING')
  )
);

create index if not exists payroll_items_run_idx
  on public.payroll_items (payroll_run_id, status);

create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_item_id uuid not null references public.payroll_items(id) on delete cascade,
  type text not null,
  amount text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint payroll_adjustments_type_check check (type in ('BONUS', 'DEDUCTION', 'MANUAL_ADJUSTMENT'))
);

create table if not exists public.payroll_executions (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  payroll_item_id uuid references public.payroll_items(id) on delete set null,
  batch_payment_id text,
  transaction_id text,
  blockchain_transaction_hash text,
  idempotency_key text not null unique,
  status text not null,
  attempt_number integer not null default 1,
  failure_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payroll_executions_run_idx
  on public.payroll_executions (payroll_run_id, status);

create table if not exists public.payroll_audit_logs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  payroll_run_id uuid references public.payroll_runs(id) on delete set null,
  action text not null,
  actor_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payroll_audit_logs_account_idx
  on public.payroll_audit_logs (account_id, created_at desc);
