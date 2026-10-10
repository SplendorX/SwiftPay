-- Rewards v2 (REWARDS-PLAN.md): SwiftPoints Rewards (monthly cashback tiers,
-- streaks, quests, discounts on premium purchases) and USDC Invite & Earn.
-- Server-only tables: RLS on, no policies (the service role reads and writes).
-- Safe to run more than once.

-- 1. New ledger entry types.
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
      'STREAK_REWARD',
      'QUEST_REWARD',
      'DISCOUNT_CLAIM',
      'REDEMPTION',
      'PURCHASE',
      'GIFT_SENT',
      'GIFT_RECEIVED',
      'ENTITLEMENT_UNLOCK',
      'ADMIN_ADJUSTMENT',
      'REVERSAL'
    )
  );

-- 2. Monthly transaction cashback: volume and points per wallet per month,
--    and one row per transaction so a retry never counts twice.
create table if not exists public.rewards_monthly_usage (
  wallet_address text not null,
  month date not null,
  eligible_volume_usd numeric not null default 0 check (eligible_volume_usd >= 0),
  points_earned numeric not null default 0 check (points_earned >= 0),
  updated_at timestamptz not null default now(),
  primary key (wallet_address, month)
);

create table if not exists public.rewards_cashback_events (
  tx_key text primary key,
  wallet_address text not null,
  month date not null,
  volume_usd numeric not null,
  points numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists rewards_cashback_events_wallet_idx
  on public.rewards_cashback_events (wallet_address, created_at desc);

-- Cashback for one transaction, with the month's tiers and cap applied under
-- a row lock. Returns the points to credit (the same answer on a retry).
--   tier 1: p_tier1_rate points per USD up to p_tier1_limit USD in the month
--   tier 2: p_tier2_rate points per USD up to p_tier2_limit USD in the month
--   never more than p_fee_cap_points, nor past p_monthly_cap points.
create or replace function public.rewards_award_cashback(
  p_wallet text,
  p_tx_key text,
  p_volume_usd numeric,
  p_fee_cap_points numeric,
  p_tier1_limit numeric,
  p_tier1_rate numeric,
  p_tier2_limit numeric,
  p_tier2_rate numeric,
  p_monthly_cap numeric
) returns numeric
language plpgsql
as $$
declare
  v_wallet text := lower(p_wallet);
  v_month date := date_trunc('month', timezone('utc', now()))::date;
  v_existing numeric;
  v_used numeric;
  v_points_used numeric;
  v_t1 numeric;
  v_t2 numeric;
  v_points numeric;
begin
  select points into v_existing from public.rewards_cashback_events where tx_key = p_tx_key;
  if found then
    return v_existing;
  end if;

  insert into public.rewards_monthly_usage (wallet_address, month)
  values (v_wallet, v_month)
  on conflict (wallet_address, month) do nothing;

  select eligible_volume_usd, points_earned into v_used, v_points_used
  from public.rewards_monthly_usage
  where wallet_address = v_wallet and month = v_month
  for update;

  v_t1 := greatest(0, least(p_volume_usd, p_tier1_limit - v_used));
  v_t2 := greatest(0, least(p_volume_usd - v_t1, p_tier2_limit - greatest(v_used, p_tier1_limit)));
  v_points := v_t1 * p_tier1_rate + v_t2 * p_tier2_rate;
  v_points := least(v_points, greatest(p_fee_cap_points, 0), greatest(p_monthly_cap - v_points_used, 0));
  -- The ledger keeps 1/100 of a point.
  v_points := floor(v_points * 100) / 100;

  update public.rewards_monthly_usage
  set eligible_volume_usd = v_used + greatest(p_volume_usd, 0),
      points_earned = v_points_used + v_points,
      updated_at = now()
  where wallet_address = v_wallet and month = v_month;

  insert into public.rewards_cashback_events (tx_key, wallet_address, month, volume_usd, points)
  values (p_tx_key, v_wallet, v_month, greatest(p_volume_usd, 0), v_points);

  return v_points;
end;
$$;

-- 3. Streaks: one row per wallet per UTC day with an eligible transaction.
create table if not exists public.rewards_activity_days (
  wallet_address text not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (wallet_address, day)
);

create table if not exists public.rewards_streaks (
  wallet_address text primary key,
  current_streak integer not null default 0,
  -- Position in the 30-day milestone cycle (1..30).
  cycle_day integer not null default 0,
  last_day date,
  total_days integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Record today for a wallet. new_day is false when today was already counted.
create or replace function public.rewards_record_day(p_wallet text, p_day date)
returns table (new_day boolean, current_streak integer, cycle_day integer, total_days integer)
language plpgsql
as $$
declare
  v_wallet text := lower(p_wallet);
  v_row public.rewards_streaks%rowtype;
begin
  insert into public.rewards_activity_days (wallet_address, day)
  values (v_wallet, p_day)
  on conflict do nothing;

  if not found then
    select * into v_row from public.rewards_streaks where wallet_address = v_wallet;
    return query select false, coalesce(v_row.current_streak, 0), coalesce(v_row.cycle_day, 0), coalesce(v_row.total_days, 0);
    return;
  end if;

  insert into public.rewards_streaks (wallet_address)
  values (v_wallet)
  on conflict (wallet_address) do nothing;

  select * into v_row from public.rewards_streaks where wallet_address = v_wallet for update;

  if v_row.last_day = p_day - 1 then
    v_row.current_streak := v_row.current_streak + 1;
    v_row.cycle_day := case when v_row.cycle_day >= 30 then 1 else v_row.cycle_day + 1 end;
  else
    v_row.current_streak := 1;
    v_row.cycle_day := 1;
  end if;
  v_row.total_days := v_row.total_days + 1;

  update public.rewards_streaks
  set current_streak = v_row.current_streak,
      cycle_day = v_row.cycle_day,
      last_day = p_day,
      total_days = v_row.total_days,
      updated_at = now()
  where wallet_address = v_wallet;

  return query select true, v_row.current_streak, v_row.cycle_day, v_row.total_days;
end;
$$;

-- 4. Quests (campaigns). Shown while live; awarded once per wallet.
create table if not exists public.rewards_quests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  points numeric not null check (points > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  rule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rewards_quest_completions (
  quest_id uuid not null references public.rewards_quests(id) on delete cascade,
  wallet_address text not null,
  ledger_entry_id uuid,
  completed_at timestamptz not null default now(),
  primary key (quest_id, wallet_address)
);

-- 5. Premium purchases, paid in USDC: what discounts are claimed against.
create table if not exists public.premium_purchases (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  product text not null check (
    product in ('EARN_AUTO_DEPOSIT', 'PAYROLL_AUTO_SCHEDULE', 'ALLIE_PRO', 'ALLIE_OVERAGE')
  ),
  amount_usdc numeric not null check (amount_usdc > 0),
  tx_hash text not null unique,
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'REFUNDED')),
  points_eligible boolean not null default true,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists premium_purchases_wallet_idx
  on public.premium_purchases (wallet_address, created_at desc);

-- 6. Discount claims: points spent for a USDC refund on one purchase.
create table if not exists public.rewards_discount_claims (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  purchase_id uuid not null unique references public.premium_purchases(id) on delete restrict,
  refund_percent integer not null check (refund_percent in (25, 50, 75, 100)),
  refund_usdc numeric not null check (refund_usdc >= 0.5),
  points_spent numeric not null check (points_spent > 0),
  ledger_entry_id uuid,
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'FAILED', 'REVERSED')),
  payout_tx_hash text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rewards_discount_claims_wallet_idx
  on public.rewards_discount_claims (wallet_address, created_at desc);

-- 7. Invite & Earn in USDC.
create table if not exists public.referral_tier_policy (
  tier text primary key check (tier in ('STARTER', 'BUILDER', 'ARCHITECT', 'AMBASSADOR')),
  sort integer not null,
  min_active_referrals integer not null default 0,
  min_monthly_volume_usd numeric not null default 0,
  commission_bps integer not null check (commission_bps between 0 and 5000),
  -- Successful transactions in a rolling 30 days that make a referral active.
  active_min_transactions integer not null default 5 check (active_min_transactions between 1 and 10),
  updated_at timestamptz not null default now()
);

insert into public.referral_tier_policy
  (tier, sort, min_active_referrals, min_monthly_volume_usd, commission_bps, active_min_transactions)
values
  ('STARTER', 1, 0, 0, 1000, 5),
  ('BUILDER', 2, 10, 5000, 1500, 5),
  ('ARCHITECT', 3, 50, 35000, 2000, 5),
  ('AMBASSADOR', 4, 200, 100000, 2500, 5)
on conflict (tier) do nothing;

create table if not exists public.referral_usdc_claims (
  id uuid primary key default gen_random_uuid(),
  referrer_wallet text not null,
  amount_usdc numeric not null check (amount_usdc > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'FAILED', 'REVIEW')),
  payout_tx_hash text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_fee_earnings (
  id uuid primary key default gen_random_uuid(),
  referrer_wallet text not null,
  referred_wallet text not null,
  tx_hash text not null,
  source text not null default 'send',
  fee_usd numeric not null check (fee_usd >= 0),
  volume_usd numeric not null default 0 check (volume_usd >= 0),
  tier text not null,
  commission_bps integer not null,
  amount_usdc numeric not null check (amount_usdc >= 0),
  status text not null default 'ACCRUED' check (status in ('ACCRUED', 'HELD', 'CLAIMED', 'REVERSED')),
  claim_id uuid references public.referral_usdc_claims(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tx_hash, referred_wallet)
);

create index if not exists referral_fee_earnings_referrer_idx
  on public.referral_fee_earnings (referrer_wallet, status, created_at desc);
create index if not exists referral_fee_earnings_referred_idx
  on public.referral_fee_earnings (referred_wallet, created_at desc);

alter table public.rewards_monthly_usage enable row level security;
alter table public.rewards_cashback_events enable row level security;
alter table public.rewards_activity_days enable row level security;
alter table public.rewards_streaks enable row level security;
alter table public.rewards_quests enable row level security;
alter table public.rewards_quest_completions enable row level security;
alter table public.premium_purchases enable row level security;
alter table public.rewards_discount_claims enable row level security;
alter table public.referral_tier_policy enable row level security;
alter table public.referral_usdc_claims enable row level security;
alter table public.referral_fee_earnings enable row level security;

revoke all on function public.rewards_award_cashback(text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.rewards_record_day(text, date) from public, anon, authenticated;

-- The server reads and writes these with the service role. Tables created
-- after the original `grant all on all tables` don't inherit it.
grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.rewards_monthly_usage,
  public.rewards_cashback_events,
  public.rewards_activity_days,
  public.rewards_streaks,
  public.rewards_quests,
  public.rewards_quest_completions,
  public.premium_purchases,
  public.rewards_discount_claims,
  public.referral_tier_policy,
  public.referral_usdc_claims,
  public.referral_fee_earnings
to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.rewards_award_cashback(text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to service_role;
grant execute on function public.rewards_record_day(text, date) to service_role;
