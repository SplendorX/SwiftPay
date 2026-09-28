-- Two-factor authentication: an authenticator-app code (TOTP) asked for on
-- every new sign-in, with single-use backup codes. Keyed by the wallet the
-- account signed in with. Server-only.
create table if not exists public.two_factor (
  owner_wallet text primary key,
  -- AES-256-GCM, key SWIFTPAY_MFA_KEY: v1.<iv>.<ciphertext+tag> (base64url)
  secret_encrypted text not null,
  -- The last time step accepted, so a code can't be used twice.
  last_step bigint not null default 0,
  -- sha256 hashes of the unused backup codes.
  backup_code_hashes text[] not null default '{}',
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  enabled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.two_factor enable row level security;
revoke all on public.two_factor from anon, authenticated;
grant select, insert, update, delete on public.two_factor to service_role;

drop policy if exists two_factor_no_client_access on public.two_factor;
create policy two_factor_no_client_access
  on public.two_factor
  for all
  using (false)
  with check (false);
