-- Remove PrivSwiftPay claim notifications and drop the kind from the check.
-- Run in Supabase SQL editor after PrivPay is retired.

delete from public.savings_notifications
where kind = 'privswiftpay_claim'
   or coalesce(metadata->>'type', '') = 'privswiftpay_claim'
   or coalesce(body, '') ilike '%CLAIM_CODE:privswiftpay:%'
   or coalesce(body, '') ilike '%privswiftpay:%';

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
      'payment_request_declined',
      'fixed_lock_started',
      'fixed_unlock_ready',
      'circle_invitation',
      'circle_invitation_accepted',
      'circle_invitation_declined',
      'circle_message',
      'circle_payment',
      'circle_request',
      'circle_request_paid',
      'circle_request_declined',
      'circle_save',
      'circle_earn',
      'circle_withdrawal',
      'circle_approval',
      'circle_member',
      'circle_role',
      'circle_frozen'
    )
  );
