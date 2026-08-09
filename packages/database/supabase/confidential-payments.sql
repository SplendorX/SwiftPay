-- SwiftPay Confidential Payments schema
-- Run in Supabase SQL editor. Service role only; no plaintext columns for secrets.

-- Payments (settlement + public metadata)
create table if not exists public.confidential_payments (
  id text primary key,
  transaction_hash text,
  status text not null default 'pending',
  sender_wallet text not null,
  recipient_wallet text not null,
  token text not null,
  network text not null,
  chain_id integer not null default 0,
  privacy_enabled boolean not null default false,
  public_label text not null default 'Payment',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists confidential_payments_sender_idx
  on public.confidential_payments (sender_wallet);
create index if not exists confidential_payments_recipient_idx
  on public.confidential_payments (recipient_wallet);
create index if not exists confidential_payments_tx_idx
  on public.confidential_payments (transaction_hash);
create index if not exists confidential_payments_created_idx
  on public.confidential_payments (created_at desc);

-- Encrypted payloads (nothing readable without decryption keys)
create table if not exists public.encrypted_payments (
  payment_id text primary key references public.confidential_payments (id) on delete cascade,
  encrypted_amount jsonb,
  encrypted_memo jsonb,
  encrypted_invoice jsonb,
  encrypted_receipt jsonb,
  encrypted_metadata jsonb,
  encrypted_merchant_notes jsonb,
  sender_wrapped_key text not null,
  recipient_wrapped_key text not null,
  options jsonb not null default '{}'::jsonb,
  provider_id text not null default 'swiftpay'
);

-- View keys (token hash only — never store raw secrets)
create table if not exists public.view_keys (
  id text primary key,
  payment_id text not null references public.confidential_payments (id) on delete cascade,
  label text not null default 'Audit access',
  permissions jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null,
  signature text not null,
  wrapped_key text not null,
  token_prefix text not null,
  token_hash text not null unique,
  grantee_wallet text,
  grantee_label text
);

create index if not exists view_keys_payment_idx on public.view_keys (payment_id);
create index if not exists view_keys_token_hash_idx on public.view_keys (token_hash);

-- Private receipts
create table if not exists public.confidential_receipts (
  id text primary key,
  payment_id text not null references public.confidential_payments (id) on delete cascade,
  share_scope text not null default 'private',
  encrypted_payload jsonb,
  public_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text not null,
  qr_payload text not null default ''
);

create index if not exists confidential_receipts_payment_idx
  on public.confidential_receipts (payment_id);

-- Privacy settings per wallet
create table if not exists public.privacy_settings (
  wallet_address text primary key,
  default_payment_mode text not null default 'standard',
  auto_encrypt_memos boolean not null default false,
  hide_activity_feed boolean not null default false,
  generate_receipts_automatically boolean not null default true,
  generate_view_keys_automatically boolean not null default false,
  show_privacy_reminder boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Audit logs (no plaintext confidential fields)
create table if not exists public.confidential_audit_logs (
  id text primary key,
  payment_id text,
  actor_wallet text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists confidential_audit_logs_payment_idx
  on public.confidential_audit_logs (payment_id);
create index if not exists confidential_audit_logs_actor_idx
  on public.confidential_audit_logs (actor_wallet);

-- Permission grants
create table if not exists public.permission_grants (
  id text primary key,
  payment_id text not null,
  view_key_id text not null,
  grantee_wallet text,
  grantee_label text,
  permissions jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null
);

-- Private invoices
create table if not exists public.private_invoices (
  id text primary key,
  merchant_wallet text not null,
  customer_wallet text,
  encrypted_payload jsonb not null,
  status text not null default 'draft',
  payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists private_invoices_merchant_idx
  on public.private_invoices (merchant_wallet);

-- RLS: service role only for server-side access patterns
alter table public.confidential_payments enable row level security;
alter table public.encrypted_payments enable row level security;
alter table public.view_keys enable row level security;
alter table public.confidential_receipts enable row level security;
alter table public.privacy_settings enable row level security;
alter table public.confidential_audit_logs enable row level security;
alter table public.permission_grants enable row level security;
alter table public.private_invoices enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.confidential_payments to service_role;
grant select, insert, update, delete on public.encrypted_payments to service_role;
grant select, insert, update, delete on public.view_keys to service_role;
grant select, insert, update, delete on public.confidential_receipts to service_role;
grant select, insert, update, delete on public.privacy_settings to service_role;
grant select, insert, update, delete on public.confidential_audit_logs to service_role;
grant select, insert, update, delete on public.permission_grants to service_role;
grant select, insert, update, delete on public.private_invoices to service_role;
