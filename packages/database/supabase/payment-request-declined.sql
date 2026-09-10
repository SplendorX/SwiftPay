-- Payment request declined notifications
-- Run in Supabase SQL editor if you already applied earlier notification migrations.

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
