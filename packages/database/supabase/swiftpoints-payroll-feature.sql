-- Add PAYROLL_AUTO_SCHEDULE to the premium features a wallet can unlock.
--
-- The entitlements table pins `feature` with a CHECK constraint, so a new
-- premium feature needs the constraint widened before anything can be granted.
--
-- Safe to re-run.

alter table public.swiftpoints_entitlements
  drop constraint if exists swiftpoints_entitlements_feature_check;

alter table public.swiftpoints_entitlements
  add constraint swiftpoints_entitlements_feature_check check (
    feature in ('EARN_AUTO_DEPOSIT', 'PAYROLL_AUTO_SCHEDULE')
  );

-- Verify: both features are now grantable, and existing rows are untouched.
select feature, count(*) as granted
from public.swiftpoints_entitlements
group by feature;
