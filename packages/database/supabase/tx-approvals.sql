-- Transaction approvals: SwiftPay's own confirmation for Google and email
-- (Circle user-controlled) wallets, replacing Circle's confirmation popup.
--
-- Before the server asks Circle for a transfer, contract call or signature,
-- the user approves it with Face ID / fingerprint (passkey), their PIN or a
-- two-factor code. Large payments, first payments to a new recipient and
-- payments past the daily total also need a code emailed to the account,
-- with the payment's real details in the email. An approval is single-use,
-- lasts two minutes and is bound to the wallet and to what it pays.
-- See lib/tx-approval. Server-only.
create table if not exists public.tx_approvals (
  -- Random; also the bearer id the browser sends with each Circle call.
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  -- The Circle wallet id the calls must come from.
  wallet_id text not null,
  -- send | swap | flow (several calls: BulkPay, payroll, Save, Earn,
  -- bridge, RecurePay) | call (one exact call) | sign
  kind text not null,
  title text not null,
  -- What it pays, as the server decoded or was told (display + risk).
  amount numeric,
  token text,
  amount_usd numeric,
  destination text,
  -- A flow's allowed recipients; each payment it makes must go to one.
  recipients text[] not null default '{}',
  -- What a flow has paid out so far, against `amount`.
  paid_total numeric not null default 0,
  -- sha256 of each exact call this approval covers (kind = call); empty
  -- for a grouped approval, whose calls are decoded and checked instead.
  call_hashes text[] not null default '{}',
  max_uses integer not null default 1 check (max_uses between 1 and 12),
  uses integer not null default 0,
  -- pending → approved. Calls are refused until approved.
  status text not null default 'pending' check (status in ('pending', 'approved')),
  -- How it was approved: passkey | pin | totp | backup
  method text,
  method_verified boolean not null default false,
  -- The emailed code, when the risk checks asked for one.
  needs_email_code boolean not null default false,
  email_code_hash text,
  email_attempts integer not null default 0,
  passkey_challenge text,
  -- Each Circle call made with it: { at, action, contract, selector }.
  uses_log jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrades a table made by the first version of this file (before flows),
-- which `create table if not exists` above leaves untouched.
alter table public.tx_approvals
  add column if not exists recipients text[] not null default '{}',
  add column if not exists paid_total numeric not null default 0;

create index if not exists tx_approvals_owner_created_idx
  on public.tx_approvals (owner_wallet, created_at desc);

create index if not exists tx_approvals_owner_destination_idx
  on public.tx_approvals (owner_wallet, destination)
  where uses > 0;

-- The address security emails go to. Captured once, from the profile's
-- contact email, so changing the profile email later (from a stolen session,
-- say) doesn't redirect the codes.
create table if not exists public.tx_security (
  owner_wallet text primary key,
  alert_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tx_approvals enable row level security;
alter table public.tx_security enable row level security;
revoke all on public.tx_approvals from anon, authenticated;
revoke all on public.tx_security from anon, authenticated;
grant select, insert, update, delete on public.tx_approvals to service_role;
grant select, insert, update, delete on public.tx_security to service_role;

drop policy if exists tx_approvals_no_client_access on public.tx_approvals;
create policy tx_approvals_no_client_access
  on public.tx_approvals
  for all
  using (false)
  with check (false);

drop policy if exists tx_security_no_client_access on public.tx_security;
create policy tx_security_no_client_access
  on public.tx_security
  for all
  using (false)
  with check (false);

-- Re-runnable on a database that ran an earlier version of this file.
alter table public.tx_approvals add column if not exists recipients text[] not null default '{}';
alter table public.tx_approvals add column if not exists paid_total numeric not null default 0;
alter table public.tx_approvals drop constraint if exists tx_approvals_max_uses_check;
alter table public.tx_approvals add constraint tx_approvals_max_uses_check check (max_uses between 1 and 12);

create index if not exists tx_approvals_owner_recipients_idx
  on public.tx_approvals using gin (recipients);
