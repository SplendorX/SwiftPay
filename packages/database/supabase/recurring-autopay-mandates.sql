-- Autopay mandates (RecurePayExecutor v2).
-- Each authorized schedule is now paid under an on-chain mandate the payer
-- created, which fixes the recipient, token and cap per period. The server
-- stores its id and passes only that id to the executor.
alter table public.recurring_schedules
  add column if not exists authorization_mandate_id text;

-- Schedules authorized under the old executor have no mandate and can't be
-- paid by the new one; ask their owners to authorize again.
update public.recurring_schedules
   set authorization_status = 'REAUTHORIZATION_REQUIRED',
       autopay_enabled = false,
       updated_at = now()
 where authorization_status = 'AUTHORIZED'
   and authorization_mandate_id is null;
