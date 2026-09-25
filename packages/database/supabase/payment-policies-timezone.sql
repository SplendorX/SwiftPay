-- The owner's IANA time zone (e.g. 'Africa/Lagos'), so the daily spending
-- limit and "spent today" reset at the owner's local midnight rather than on
-- a rolling 24-hour window. Reported by the browser; 'UTC' until then.
--
-- Safe to re-run.

alter table public.payment_policies
  add column if not exists timezone text not null default 'UTC';

-- Verify: every policy now has a time zone.
select timezone, count(*) as policies
from public.payment_policies
group by timezone;
