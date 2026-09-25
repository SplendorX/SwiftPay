-- Lock down SwiftPoints economy and Earn auto-deposit tables.
-- These were created without row level security, which lets anyone holding the
-- public anon key read and write them. The app only touches them through the
-- service-role client (lib/referral/db.ts, lib/earn/auto-deposit.ts), which
-- bypasses RLS, so a deny-all client policy is safe.

do $$
declare
  t text;
begin
  foreach t in array array[
    'swiftpoints_entitlements',
    'swiftpoints_purchases',
    'swiftpoints_gifts',
    'earn_auto_deposit_rules',
    'earn_auto_deposit_executions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_client_access', t);
    execute format(
      'create policy %I on public.%I for all using (false) with check (false)',
      t || '_no_client_access', t
    );
  end loop;
end
$$;
