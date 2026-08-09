-- Swift+Save: non-interest-bearing savings pockets + Spend&Save
-- Run in Supabase SQL editor. Service role only.
-- IMPORTANT: No yield, APY, interest, lending, or DeFi returns.

-- ─── Savings pockets ─────────────────────────────────────────────────────────
create table if not exists public.savings_pockets (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  name text not null,
  image_url text,
  icon text not null default 'piggy',
  description text,
  target_amount text,
  target_amount_units text,
  current_balance text not null default '0',
  current_balance_units text not null default '0',
  currency text not null default 'USDC',
  status text not null default 'active',
  -- When true, stop automatic Spend&Save deposits once target is reached.
  -- Default false = continue saving beyond target.
  stop_at_target boolean not null default false,
  target_reached_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint savings_pockets_name_len check (char_length(name) between 1 and 50),
  constraint savings_pockets_status_check check (status in ('active', 'archived'))
);

-- Safe upgrades for existing installs
alter table public.savings_pockets
  add column if not exists stop_at_target boolean not null default false;
alter table public.savings_pockets
  add column if not exists target_reached_at timestamptz;

create index if not exists savings_pockets_owner_idx
  on public.savings_pockets (owner_wallet, status, created_at desc);

create index if not exists savings_pockets_owner_active_idx
  on public.savings_pockets (owner_wallet)
  where status = 'active';

-- ─── Savings transactions ────────────────────────────────────────────────────
create table if not exists public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  pocket_id uuid not null references public.savings_pockets(id) on delete restrict,
  type text not null,
  amount text not null,
  amount_units text not null,
  currency text not null default 'USDC',
  status text not null default 'PENDING',
  tx_hash text,
  related_payment_id text,
  related_payment_tx_hash text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  failed_at timestamptz,
  constraint savings_transactions_type_check check (
    type in ('DEPOSIT', 'WITHDRAWAL', 'SPEND_SAVE', 'REFUND', 'REVERSAL', 'ADJUSTMENT')
  ),
  constraint savings_transactions_status_check check (
    status in (
      'PENDING',
      'PROCESSING',
      'PAYMENT_SUBMITTED',
      'PAYMENT_CONFIRMED',
      'SAVINGS_SUBMITTED',
      'SAVINGS_CONFIRMED',
      'COMPLETED',
      'FAILED',
      'REQUIRES_RECONCILIATION'
    )
  )
);

create unique index if not exists savings_transactions_idempotency_uidx
  on public.savings_transactions (idempotency_key);

create index if not exists savings_transactions_owner_idx
  on public.savings_transactions (owner_wallet, created_at desc);

create index if not exists savings_transactions_pocket_idx
  on public.savings_transactions (pocket_id, created_at desc);

create index if not exists savings_transactions_status_idx
  on public.savings_transactions (status, created_at desc);

create index if not exists savings_transactions_tx_hash_idx
  on public.savings_transactions (tx_hash)
  where tx_hash is not null;

-- ─── Spend&Save configuration (one active config per wallet) ─────────────────
create table if not exists public.spend_save_configs (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  enabled boolean not null default false,
  percentage numeric(5, 2) not null,
  pocket_id uuid not null references public.savings_pockets(id) on delete restrict,
  eligible_payment_type text not null default 'all_outgoing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paused_at timestamptz,
  disabled_at timestamptz,
  constraint spend_save_percentage_check check (
    percentage >= 1 and percentage <= 50
  ),
  constraint spend_save_eligible_check check (
    eligible_payment_type in (
      'all_outgoing',
      'merchant',
      'transfers',
      'bills',
      'online',
      'custom'
    )
  )
);

create unique index if not exists spend_save_configs_owner_uidx
  on public.spend_save_configs (owner_wallet);

create index if not exists spend_save_configs_pocket_idx
  on public.spend_save_configs (pocket_id);

-- ─── Spend&Save events (audit / reconciliation) ──────────────────────────────
create table if not exists public.spend_save_events (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  config_id uuid references public.spend_save_configs(id) on delete set null,
  payment_id text,
  payment_tx_hash text,
  pocket_id uuid not null references public.savings_pockets(id) on delete restrict,
  payment_amount text not null,
  payment_amount_units text not null,
  save_percentage numeric(5, 2) not null,
  save_amount text not null,
  save_amount_units text not null,
  currency text not null default 'USDC',
  status text not null default 'PENDING',
  savings_transaction_id uuid references public.savings_transactions(id) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spend_save_events_status_check check (
    status in (
      'PENDING',
      'PROCESSING',
      'PAYMENT_SUBMITTED',
      'PAYMENT_CONFIRMED',
      'SAVINGS_SUBMITTED',
      'SAVINGS_CONFIRMED',
      'COMPLETED',
      'FAILED',
      'REQUIRES_RECONCILIATION'
    )
  )
);

create index if not exists spend_save_events_owner_idx
  on public.spend_save_events (owner_wallet, created_at desc);

create index if not exists spend_save_events_status_idx
  on public.spend_save_events (status, created_at desc);

create index if not exists spend_save_events_payment_idx
  on public.spend_save_events (payment_tx_hash)
  where payment_tx_hash is not null;

-- Link reversals to original savings transactions (audit trail)
alter table public.savings_transactions
  add column if not exists related_savings_transaction_id uuid
    references public.savings_transactions(id) on delete set null;

-- ─── In-app notifications (non-sensitive copy only) ───────────────────────────
create table if not exists public.savings_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  kind text not null,
  title text not null,
  body text not null,
  pocket_id uuid references public.savings_pockets(id) on delete set null,
  transaction_id uuid references public.savings_transactions(id) on delete set null,
  related_tx_hash text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint savings_notifications_kind_check check (
    kind in (
      'manual_save_success',
      'spend_save_success',
      'target_reached',
      'savings_failed',
      'spend_save_paused',
      'spend_save_resumed',
      'spend_save_disabled',
      'reconciliation_alert',
      'payment_received',
      'privswiftpay_claim'
    )
  )
);

-- Safe upgrades for existing installs
alter table public.savings_notifications
  add column if not exists related_tx_hash text;
alter table public.savings_notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.savings_notifications
  drop constraint if exists savings_notifications_kind_check;
alter table public.savings_notifications
  add constraint savings_notifications_kind_check check (
    kind in (
      'manual_save_success',
      'spend_save_success',
      'target_reached',
      'savings_failed',
      'spend_save_paused',
      'spend_save_resumed',
      'spend_save_disabled',
      'reconciliation_alert',
      'payment_received',
      'privswiftpay_claim'
    )
  );

create index if not exists savings_notifications_owner_idx
  on public.savings_notifications (owner_wallet, created_at desc);

-- One notification per on-chain payment receive (dedupe)
create unique index if not exists savings_notifications_related_tx_uidx
  on public.savings_notifications (owner_wallet, related_tx_hash)
  where related_tx_hash is not null;

-- ─── Reconciliation alerts ───────────────────────────────────────────────────
create table if not exists public.savings_reconciliation_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text,
  transaction_id uuid references public.savings_transactions(id) on delete set null,
  pocket_id uuid references public.savings_pockets(id) on delete set null,
  alert_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists savings_reconciliation_open_idx
  on public.savings_reconciliation_alerts (resolved_at, created_at desc)
  where resolved_at is null;

-- ─── RLS + grants ────────────────────────────────────────────────────────────
alter table public.savings_pockets enable row level security;
alter table public.savings_transactions enable row level security;
alter table public.spend_save_configs enable row level security;
alter table public.spend_save_events enable row level security;
alter table public.savings_notifications enable row level security;
alter table public.savings_reconciliation_alerts enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.savings_pockets to service_role;
grant select, insert, update, delete on public.savings_transactions to service_role;
grant select, insert, update, delete on public.spend_save_configs to service_role;
grant select, insert, update, delete on public.spend_save_events to service_role;
grant select, insert, update, delete on public.savings_notifications to service_role;
grant select, insert, update, delete on public.savings_reconciliation_alerts to service_role;
