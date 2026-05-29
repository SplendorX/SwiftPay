create table if not exists public.platform_payment_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (
    event_type in (
      'direct_send',
      'payment_request',
      'swap',
      'private_send',
      'payroll',
      'claim',
      'profile_creation'
    )
  ),
  amount numeric not null default 0,
  token text,
  wallet_address text,
  counterparty_address text,
  tx_hash text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists platform_payment_events_created_at_idx
  on public.platform_payment_events (created_at desc);

create index if not exists platform_payment_events_event_type_idx
  on public.platform_payment_events (event_type);

create index if not exists platform_payment_events_token_idx
  on public.platform_payment_events (token);

alter table public.platform_payment_events enable row level security;

grant usage on schema public to service_role;
grant select, insert on public.platform_payment_events to service_role;

alter table public.platform_payment_events
  drop constraint if exists platform_payment_events_event_type_check;

alter table public.platform_payment_events
  add constraint platform_payment_events_event_type_check
  check (
    event_type in (
      'direct_send',
      'payment_request',
      'swap',
      'private_send',
      'payroll',
      'claim',
      'profile_creation'
    )
  );
