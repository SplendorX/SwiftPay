-- Adds 'cancelled' to payment_intents.status.
--
-- Cancelling used to be a UI-only act: pressing Cancel dismissed the card but
-- left the intent sitting at 'approved' in the ledger, still executable by
-- anyone who replayed its id. This gives the refusal somewhere to live, so the
-- execute route's "only an approved intent may run" check turns it down.
--
-- Safe to re-run. Existing rows are untouched — the new value only widens what
-- the constraint accepts.

alter table public.payment_intents
  drop constraint if exists payment_intents_status_check;

alter table public.payment_intents
  add constraint payment_intents_status_check
  check (status in (
    'pending', 'policy_check', 'approved', 'rejected', 'executing',
    'submitted', 'confirming', 'completed', 'failed', 'cancelled'
  ));
