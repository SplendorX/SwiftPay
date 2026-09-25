-- Premium entitlements: one-time unlock -> 6-month term.
--
-- Run this if you already applied swiftpoints-economy-and-auto-deposit.sql
-- before the term change. Running the full file again does the same thing;
-- this is just the delta.
--
-- Safe to re-run.

-- 1. Add the term columns.
alter table public.swiftpoints_entitlements
  add column if not exists renewed_at timestamptz;

alter table public.swiftpoints_entitlements
  add column if not exists expires_at timestamptz;

-- 2. Existing one-time grants become a 6-month term from when they were
--    granted. Anyone who unlocked under the old model keeps access until
--    then rather than losing it the moment this lands.
update public.swiftpoints_entitlements
  set expires_at = granted_at + interval '6 months'
  where expires_at is null;

-- 3. Lock the column down now that every row has a value.
alter table public.swiftpoints_entitlements
  alter column expires_at set default (now() + interval '6 months');

alter table public.swiftpoints_entitlements
  alter column expires_at set not null;

create index if not exists swiftpoints_entitlements_expiry_idx
  on public.swiftpoints_entitlements (feature, expires_at);

-- 4. Verify: every row should show an expiry, and active should be true for
--    anything granted in the last 6 months.
select
  wallet_address,
  feature,
  granted_at,
  expires_at,
  (expires_at > now()) as active
from public.swiftpoints_entitlements
order by expires_at desc;
