-- App lock: a PIN, and optionally Face ID / fingerprint (WebAuthn passkeys),
-- that a signed-in user must enter when they come back to SwiftPay.
-- Keyed by the wallet the account signed in with. Server-only: the PIN hash
-- and passkey public keys are never readable from the browser.
create table if not exists public.app_locks (
  owner_wallet text primary key,
  -- scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>
  pin_hash text not null,
  -- Minutes away from the app before it locks again.
  timeout_minutes integer not null default 1 check (timeout_minutes in (1, 5, 15)),
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_lock_passkeys (
  credential_id text primary key,
  owner_wallet text not null,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists app_lock_passkeys_owner_idx
  on public.app_lock_passkeys (owner_wallet);

alter table public.app_locks enable row level security;
alter table public.app_lock_passkeys enable row level security;
revoke all on public.app_locks from anon, authenticated;
revoke all on public.app_lock_passkeys from anon, authenticated;
grant select, insert, update, delete on public.app_locks to service_role;
grant select, insert, update, delete on public.app_lock_passkeys to service_role;

drop policy if exists app_locks_no_client_access on public.app_locks;
create policy app_locks_no_client_access
  on public.app_locks
  for all
  using (false)
  with check (false);

drop policy if exists app_lock_passkeys_no_client_access on public.app_lock_passkeys;
create policy app_lock_passkeys_no_client_access
  on public.app_lock_passkeys
  for all
  using (false)
  with check (false);
