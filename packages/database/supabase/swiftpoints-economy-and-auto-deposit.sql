-- SwiftPoints economy extensions + Earn auto-deposit.
--
-- Adds two ways points move besides referral rewards (purchase and gift), a
-- one-time entitlement unlock, and the rule table behind Earn auto-deposit.
--
-- Safe to re-run.

-- 1. Widen the ledger entry types.
--    Also adds TRANSACTION_CASHBACK, which the TypeScript union already had
--    but the constraint did not — writing one would have failed at insert.
alter table public.swiftpoints_ledger_entries
  drop constraint if exists swiftpoints_ledger_entries_entry_type_check;

alter table public.swiftpoints_ledger_entries
  add constraint swiftpoints_ledger_entries_entry_type_check check (
    entry_type in (
      'REFERRER_PERSONAL_QUALIFICATION_REWARD',
      'REFERRER_BUSINESS_QUALIFICATION_REWARD',
      'REFERRED_PERSONAL_QUALIFICATION_REWARD',
      'REFERRED_BUSINESS_QUALIFICATION_REWARD',
      'REFERRER_PERSONAL_ACTIVITY_CASHBACK',
      'REFERRER_BUSINESS_ACTIVITY_CASHBACK',
      'TRANSACTION_CASHBACK',
      'REDEMPTION',
      'PURCHASE',
      'GIFT_SENT',
      'GIFT_RECEIVED',
      'ENTITLEMENT_UNLOCK',
      'ADMIN_ADJUSTMENT',
      'REVERSAL'
    )
  );

-- 2. Entitlements: features unlocked by spending points, for 6 months at a time.
--    One row per wallet per feature: a renewal extends `expires_at` rather
--    than inserting again, so the unique constraint still makes a
--    double-click harmless.
create table if not exists public.swiftpoints_entitlements (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles(wallet_address) on delete cascade,
  feature text not null check (feature in ('EARN_AUTO_DEPOSIT')),
  points_spent integer not null check (points_spent >= 0),
  ledger_entry_id uuid references public.swiftpoints_ledger_entries(id) on delete set null,
  granted_at timestamptz not null default now(),
  renewed_at timestamptz,
  -- The access is active while now() < expires_at.
  expires_at timestamptz not null default (now() + interval '6 months'),
  unique (wallet_address, feature)
);

-- Existing one-time grants become a year from when they were granted.
alter table public.swiftpoints_entitlements
  add column if not exists renewed_at timestamptz;

alter table public.swiftpoints_entitlements
  add column if not exists expires_at timestamptz;

update public.swiftpoints_entitlements
  set expires_at = granted_at + interval '6 months'
  where expires_at is null;

alter table public.swiftpoints_entitlements
  alter column expires_at set default (now() + interval '6 months');

alter table public.swiftpoints_entitlements
  alter column expires_at set not null;

create index if not exists swiftpoints_entitlements_expiry_idx
  on public.swiftpoints_entitlements (feature, expires_at);

create index if not exists swiftpoints_entitlements_wallet_idx
  on public.swiftpoints_entitlements (wallet_address);

-- 3. Purchases: points bought with on-chain USDC.
--    tx_hash is unique so one payment can never be credited twice.
create table if not exists public.swiftpoints_purchases (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles(wallet_address) on delete restrict,
  points integer not null check (points > 0),
  usdc_amount numeric not null check (usdc_amount > 0),
  chain_id integer not null,
  tx_hash text not null unique,
  status text not null default 'COMPLETED' check (status in ('PENDING', 'COMPLETED', 'FAILED')),
  ledger_entry_id uuid references public.swiftpoints_ledger_entries(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists swiftpoints_purchases_wallet_idx
  on public.swiftpoints_purchases (wallet_address, created_at desc);

-- 4. Gifts: points moved wallet to wallet.
--    Two ledger entries back each row (debit the sender, credit the
--    recipient); this table is the human-readable pairing of the two.
create table if not exists public.swiftpoints_gifts (
  id uuid primary key default gen_random_uuid(),
  sender_wallet text not null references public.profiles(wallet_address) on delete restrict,
  recipient_wallet text not null references public.profiles(wallet_address) on delete restrict,
  points integer not null check (points > 0),
  note text,
  sender_ledger_entry_id uuid references public.swiftpoints_ledger_entries(id) on delete set null,
  recipient_ledger_entry_id uuid references public.swiftpoints_ledger_entries(id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint swiftpoints_gifts_not_self check (sender_wallet <> recipient_wallet)
);

create index if not exists swiftpoints_gifts_sender_idx
  on public.swiftpoints_gifts (sender_wallet, created_at desc);
create index if not exists swiftpoints_gifts_recipient_idx
  on public.swiftpoints_gifts (recipient_wallet, created_at desc);

-- 5. Earn auto-deposit rules.
--    mode SWEEP     -> offered for one-tap confirmation when the owner opens
--                      the app; the owner still signs.
--    mode UNATTENDED -> executed by the operator through
--                      EarnAutoSaveExecutor against a standing allowance.
create table if not exists public.earn_auto_deposit_rules (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique references public.profiles(wallet_address) on delete cascade,
  mode text not null check (mode in ('SWEEP', 'UNATTENDED')),
  vault_address text not null,
  amount_usdc numeric not null check (amount_usdc > 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  -- Liquid USDC that must survive the deposit, so a rule can never drain the
  -- wallet below what the owner needs on hand.
  min_balance_floor numeric not null default 0 check (min_balance_floor >= 0),
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null default now(),
  -- Set when a run fails so the UI can explain itself instead of going quiet.
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists earn_auto_deposit_rules_due_idx
  on public.earn_auto_deposit_rules (next_run_at)
  where enabled;

-- 6. Executions: one row per attempt, for history and idempotency.
create table if not exists public.earn_auto_deposit_executions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.earn_auto_deposit_rules(id) on delete cascade,
  wallet_address text not null,
  mode text not null check (mode in ('SWEEP', 'UNATTENDED')),
  amount_usdc numeric not null,
  vault_address text not null,
  status text not null check (status in ('SUCCEEDED', 'FAILED', 'SKIPPED')),
  reason text,
  tx_hash text,
  execution_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists earn_auto_deposit_executions_wallet_idx
  on public.earn_auto_deposit_executions (wallet_address, created_at desc);
