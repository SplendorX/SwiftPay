-- ============================================================================
-- SwiftPay Referral & SwiftPoints System Schema
-- Production-ready PostgreSQL Schema for Universal Referral Tiers & SwiftPoints Ledger
-- ============================================================================

-- 1. Referral Profiles
create table if not exists public.referral_profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique references public.profiles(wallet_address) on delete restrict,
  referral_token text not null unique,
  total_successful_referrals integer not null default 0 check (total_successful_referrals >= 0),
  successful_personal_referrals integer not null default 0 check (successful_personal_referrals >= 0),
  successful_business_referrals integer not null default 0 check (successful_business_referrals >= 0),
  current_tier text not null default 'STARTER' check (current_tier in ('STARTER', 'BUILDER', 'ARCHITECT', 'AMBASSADOR')),
  tier_upgraded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referral_profiles_wallet_idx on public.referral_profiles (wallet_address);
create index if not exists referral_profiles_token_idx on public.referral_profiles (referral_token);
create index if not exists referral_profiles_tier_idx on public.referral_profiles (current_tier);

-- 2. Referral Attributions (Visitor Clicks)
create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referral_token text not null,
  referrer_wallet text not null references public.profiles(wallet_address) on delete cascade,
  visitor_id text,
  ip_hash text,
  user_agent text,
  referer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists referral_attributions_token_idx on public.referral_attributions (referral_token, created_at desc);
create index if not exists referral_attributions_referrer_idx on public.referral_attributions (referrer_wallet, created_at desc);

-- 3. Referrals (Core Lifecycle State Machine)
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_wallet text not null references public.profiles(wallet_address) on delete restrict,
  referred_wallet text not null unique references public.profiles(wallet_address) on delete restrict,
  referral_token text not null,
  referred_username_snapshot text,
  referrer_username_snapshot text,
  referred_account_type text not null default 'PERSONAL' check (referred_account_type in ('PERSONAL', 'BUSINESS')),
  status text not null default 'CLICKED' check (
    status in ('CLICKED', 'SIGNED_UP', 'VERIFIED', 'ACTIVATED', 'PENDING_QUALIFICATION', 'QUALIFIED', 'REWARDED', 'FRAUD_REVIEW', 'REJECTED', 'REVERSED')
  ),
  fraud_status text not null default 'LOW_RISK' check (
    fraud_status in ('LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK', 'REVIEW_REQUIRED', 'BLOCKED')
  ),
  tier_at_qualification text check (tier_at_qualification in ('STARTER', 'BUILDER', 'ARCHITECT', 'AMBASSADOR')),
  successful_referral_position integer,
  direct_reward_amount numeric not null default 0,
  clicked_at timestamptz,
  signed_up_at timestamptz,
  verified_at timestamptz,
  activated_at timestamptz,
  qualified_at timestamptz,
  rewarded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (lower(referrer_wallet) <> lower(referred_wallet))
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_wallet, created_at desc);
create index if not exists referrals_referred_idx on public.referrals (referred_wallet);
create index if not exists referrals_status_idx on public.referrals (status);
create index if not exists referrals_token_idx on public.referrals (referral_token);

-- 4. Referral Qualifications
create table if not exists public.referral_qualifications (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.referrals(id) on delete cascade,
  referred_wallet text not null references public.profiles(wallet_address) on delete restrict,
  referrer_wallet text not null references public.profiles(wallet_address) on delete restrict,
  account_type text not null check (account_type in ('PERSONAL', 'BUSINESS')),
  tier_at_qualification text not null check (tier_at_qualification in ('STARTER', 'BUILDER', 'ARCHITECT', 'AMBASSADOR')),
  qualification_method text not null check (qualification_method in ('TRANSACTION_COUNT', 'TRANSACTION_VOLUME', 'BUSINESS_VOLUME')),
  qualifying_transaction_count integer not null default 0,
  qualifying_transaction_volume numeric not null default 0,
  activation_balance numeric not null default 0,
  policy_version text not null default '1.0',
  qualification_snapshot jsonb not null default '{}'::jsonb,
  referrer_reward_points numeric not null default 0,
  referred_reward_points numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists referral_qualifications_referrer_idx on public.referral_qualifications (referrer_wallet);
create index if not exists referral_qualifications_referred_idx on public.referral_qualifications (referred_wallet);

-- 5. Referral Tier History
create table if not exists public.referral_tier_history (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles(wallet_address) on delete cascade,
  previous_tier text not null check (previous_tier in ('STARTER', 'BUILDER', 'ARCHITECT', 'AMBASSADOR')),
  new_tier text not null check (new_tier in ('STARTER', 'BUILDER', 'ARCHITECT', 'AMBASSADOR')),
  total_successful_referrals integer not null,
  referral_id uuid references public.referrals(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists referral_tier_history_wallet_idx on public.referral_tier_history (wallet_address, created_at desc);

-- 6. SwiftPoints Accounts (Balance Cache Layer)
create table if not exists public.swiftpoints_accounts (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique references public.profiles(wallet_address) on delete restrict,
  available_balance_units bigint not null default 0 check (available_balance_units >= 0),
  pending_balance_units bigint not null default 0 check (pending_balance_units >= 0),
  lifetime_earned_units bigint not null default 0 check (lifetime_earned_units >= 0),
  lifetime_redeemed_units bigint not null default 0 check (lifetime_redeemed_units >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists swiftpoints_accounts_wallet_idx on public.swiftpoints_accounts (wallet_address);

-- 7. SwiftPoints Ledger Entries (Immutable Financial Source of Truth)
create table if not exists public.swiftpoints_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.swiftpoints_accounts(id) on delete restrict,
  wallet_address text not null references public.profiles(wallet_address) on delete restrict,
  entry_type text not null check (
    entry_type in (
      'REFERRER_PERSONAL_QUALIFICATION_REWARD',
      'REFERRER_BUSINESS_QUALIFICATION_REWARD',
      'REFERRED_PERSONAL_QUALIFICATION_REWARD',
      'REFERRED_BUSINESS_QUALIFICATION_REWARD',
      'REFERRER_PERSONAL_ACTIVITY_CASHBACK',
      'REFERRER_BUSINESS_ACTIVITY_CASHBACK',
      'REDEMPTION',
      'ADMIN_ADJUSTMENT',
      'REVERSAL'
    )
  ),
  amount_units bigint not null, -- 100 units = 1 SwiftPoint
  display_amount numeric not null, -- amount_units / 100
  usdc_equivalent numeric not null, -- display_amount * 0.01
  status text not null default 'COMPLETED' check (status in ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
  idempotency_key text not null unique,
  referral_id uuid references public.referrals(id) on delete set null,
  transaction_id text,
  campaign_id text,
  original_ledger_entry_id uuid references public.swiftpoints_ledger_entries(id) on delete set null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  policy_version text not null default '1.0',
  created_at timestamptz not null default now(),
  created_by text not null default 'system'
);

create index if not exists swiftpoints_ledger_wallet_idx on public.swiftpoints_ledger_entries (wallet_address, created_at desc);
create index if not exists swiftpoints_ledger_account_idx on public.swiftpoints_ledger_entries (account_id, created_at desc);
create index if not exists swiftpoints_ledger_type_idx on public.swiftpoints_ledger_entries (entry_type);
create index if not exists swiftpoints_ledger_tx_idx on public.swiftpoints_ledger_entries (transaction_id) where transaction_id is not null;

-- 8. SwiftPoints Redemptions
create table if not exists public.swiftpoints_redemptions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles(wallet_address) on delete restrict,
  points_redeemed numeric not null check (points_redeemed >= 100),
  amount_units bigint not null check (amount_units >= 10000),
  usdc_amount numeric not null check (usdc_amount >= 1.0),
  destination_wallet text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED')),
  idempotency_key text not null unique,
  ledger_entry_id uuid references public.swiftpoints_ledger_entries(id) on delete set null,
  tx_hash text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists swiftpoints_redemptions_wallet_idx on public.swiftpoints_redemptions (wallet_address, created_at desc);
create index if not exists swiftpoints_redemptions_status_idx on public.swiftpoints_redemptions (status);

-- 9. Referral Activity Rewards (Referrer-only Ongoing Cashback)
create table if not exists public.referral_activity_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  referrer_wallet text not null references public.profiles(wallet_address) on delete restrict,
  referred_wallet text not null references public.profiles(wallet_address) on delete restrict,
  transaction_id text not null,
  transaction_amount numeric not null,
  transaction_currency text not null default 'USDC',
  account_type text not null check (account_type in ('PERSONAL', 'BUSINESS')),
  referrer_tier text not null check (referrer_tier in ('STARTER', 'BUILDER', 'ARCHITECT', 'AMBASSADOR')),
  cashback_points numeric not null,
  amount_units bigint not null,
  usdc_equivalent numeric not null,
  ledger_entry_id uuid references public.swiftpoints_ledger_entries(id) on delete set null,
  policy_version text not null default '1.0',
  created_at timestamptz not null default now(),
  constraint referral_activity_rewards_unique_tx unique (transaction_id, referrer_wallet)
);

create index if not exists referral_activity_referrer_idx on public.referral_activity_rewards (referrer_wallet, created_at desc);
create index if not exists referral_activity_referred_idx on public.referral_activity_rewards (referred_wallet);

-- 10. Referral Risk Assessments
create table if not exists public.referral_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid references public.referrals(id) on delete cascade,
  wallet_address text not null references public.profiles(wallet_address) on delete cascade,
  risk_level text not null default 'LOW_RISK' check (risk_level in ('LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK', 'REVIEW_REQUIRED', 'BLOCKED')),
  reasons text[] not null default '{}',
  signals jsonb not null default '{}'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists referral_risk_wallet_idx on public.referral_risk_assessments (wallet_address);
create index if not exists referral_risk_level_idx on public.referral_risk_assessments (risk_level);

-- 11. Referral Audit Logs
create table if not exists public.referral_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists referral_audit_target_idx on public.referral_audit_logs (target_type, target_id);
create index if not exists referral_audit_created_idx on public.referral_audit_logs (created_at desc);

-- 12. Referral Progress Payments (one row per counted payment; volume = sum)
create table if not exists public.referral_progress_payments (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  tx_hash text not null,
  amount_usd numeric not null check (amount_usd > 0),
  source text not null default 'activity',
  created_at timestamptz not null default now(),
  constraint referral_progress_payments_unique_tx unique (referral_id, tx_hash)
);

create index if not exists referral_progress_payments_referral_idx on public.referral_progress_payments (referral_id);

-- Security: Row Level Security & Grants
alter table public.referral_profiles enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_qualifications enable row level security;
alter table public.referral_tier_history enable row level security;
alter table public.swiftpoints_accounts enable row level security;
alter table public.swiftpoints_ledger_entries enable row level security;
alter table public.swiftpoints_redemptions enable row level security;
alter table public.referral_activity_rewards enable row level security;
alter table public.referral_risk_assessments enable row level security;
alter table public.referral_audit_logs enable row level security;
alter table public.referral_progress_payments enable row level security;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
