-- Contacts can be deleted from the Pay screen. The table only granted
-- select/insert/update, so the server's delete was refused.
--
-- Safe to re-run.

grant delete on public.beneficiaries to service_role;
