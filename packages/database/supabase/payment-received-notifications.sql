-- Payment received notifications upgrade
-- Run in Supabase SQL editor if you already applied swift-save.sql earlier.

alter table public.savings_notifications
  add column if not exists related_tx_hash text;

alter table public.savings_notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.savings_notifications
  drop constraint if exists savings_notifications_kind_check;

alter table public.savings_notifications
  add constraint savings_notifications_kind_check check (
    kind in (
      'manual_save_success',
      'spend_save_success',
      'target_reached',
      'savings_failed',
      'spend_save_paused',
      'spend_save_resumed',
      'spend_save_disabled',
      'reconciliation_alert',
      'payment_received',
      'payment_request',
      'payment_request_declined'
    )
  );

create unique index if not exists savings_notifications_related_tx_uidx
  on public.savings_notifications (owner_wallet, related_tx_hash)
  where related_tx_hash is not null;
