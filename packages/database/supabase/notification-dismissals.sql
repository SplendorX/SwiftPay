-- Soft-dismiss notifications so incoming-payment sync cannot recreate them.
-- Run in Supabase SQL editor. Service role only.

alter table public.savings_notifications
  add column if not exists dismissed_at timestamptz;

create index if not exists savings_notifications_owner_visible_idx
  on public.savings_notifications (owner_wallet, created_at desc)
  where dismissed_at is null;

create table if not exists public.savings_notification_dismissals (
  owner_wallet text not null,
  related_tx_hash text not null,
  dismissed_at timestamptz not null default now(),
  primary key (owner_wallet, related_tx_hash)
);

create index if not exists savings_notification_dismissals_owner_idx
  on public.savings_notification_dismissals (owner_wallet);

alter table public.savings_notification_dismissals enable row level security;

grant select, insert, update, delete on public.savings_notification_dismissals
  to service_role;
