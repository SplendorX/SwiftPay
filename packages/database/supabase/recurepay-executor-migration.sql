-- Run ONCE, right after the app switches to the new RecurePayExecutor address.
--
-- Autopay approvals are token allowances to a specific executor contract.
-- After the executor is redeployed, every existing approval points at the old
-- address, so schedules marked AUTHORIZED would be picked up by the worker and
-- fail against the new executor. This marks them as needing re-authorization:
-- the worker skips them, and the RecurePay page shows "Authorize Autopay" again.
-- autopay_enabled stays as it was, so the user's choice is kept.

-- 1. Preview what will change.
select status, count(*) as authorized_schedules
from public.recurring_schedules
where authorization_status = 'AUTHORIZED'
group by status;

-- 2. Require re-authorization.
update public.recurring_schedules
set authorization_status = 'REAUTHORIZATION_REQUIRED',
    authorization_tx_hash = null,
    authorized_at = null,
    updated_at = now()
where authorization_status = 'AUTHORIZED';

-- 3. Verify: should return 0.
select count(*) as still_authorized
from public.recurring_schedules
where authorization_status = 'AUTHORIZED';
