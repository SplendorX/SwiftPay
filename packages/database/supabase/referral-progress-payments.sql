-- Payments counted toward a referral's qualification volume.
--
-- One row per (referral, transaction). The unique key lets the live payment
-- report and the dashboard's chain sync record the same payment at the same
-- moment without counting it twice: the database keeps one row, and volume
-- is always the sum of these rows.
--
-- Safe to re-run.

create table if not exists public.referral_progress_payments (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  -- On-chain hash, or the RecurePay occurrence id when no hash is known.
  tx_hash text not null,
  amount_usd numeric not null check (amount_usd > 0),
  source text not null default 'activity',
  created_at timestamptz not null default now(),
  constraint referral_progress_payments_unique_tx unique (referral_id, tx_hash)
);

create index if not exists referral_progress_payments_referral_idx
  on public.referral_progress_payments (referral_id);

alter table public.referral_progress_payments enable row level security;
grant all on public.referral_progress_payments to service_role;

-- Verify: the table exists and is empty or holds counted payments.
select count(*) as counted_payments from public.referral_progress_payments;
