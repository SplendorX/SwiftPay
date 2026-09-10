-- SwiftPay Personal / Business account type on the existing profiles row.
-- One login → one account → PERSONAL or BUSINESS. Same wallet. Additive.

alter table public.profiles
  add column if not exists account_type text not null default 'PERSONAL';

alter table public.profiles
  add column if not exists account_upgraded_at timestamptz;

update public.profiles
set account_type = 'PERSONAL'
where account_type is null or account_type not in ('PERSONAL', 'BUSINESS');

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check check (
    account_type in ('PERSONAL', 'BUSINESS')
  );

create table if not exists public.account_type_history (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles(wallet_address) on delete restrict,
  previous_type text not null,
  new_type text not null,
  reason text not null,
  actor_wallet text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint account_type_history_types_check check (
    previous_type in ('PERSONAL', 'BUSINESS')
    and new_type in ('PERSONAL', 'BUSINESS')
  ),
  constraint account_type_history_reason_check check (
    reason in ('USER_ONBOARDING', 'USER_UPGRADE')
  )
);

create index if not exists account_type_history_wallet_idx
  on public.account_type_history (wallet_address, created_at desc);

create table if not exists public.business_account_profiles (
  wallet_address text primary key references public.profiles(wallet_address) on delete restrict,
  business_name text not null,
  description text,
  category text,
  country text,
  currency text not null default 'USDC',
  contact_email text,
  logo_url text,
  website text,
  phone text,
  address_line text,
  tax_identifier text,
  registration_number text,
  industry text,
  business_size text,
  social_links jsonb not null default '{}'::jsonb,
  verification_status text not null default 'UNVERIFIED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_account_profiles_name_len check (
    char_length(business_name) between 1 and 80
  ),
  constraint business_account_profiles_description_len check (
    description is null or char_length(description) <= 280
  ),
  constraint business_account_profiles_currency_check check (
    currency in ('USDC', 'EURC')
  ),
  constraint business_account_profiles_verification_check check (
    verification_status in ('UNVERIFIED', 'PENDING', 'VERIFIED')
  )
);

create table if not exists public.business_invoices (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  wallet_address text not null references public.profiles(wallet_address) on delete restrict,
  invoice_number text not null,
  status text not null default 'DRAFT',
  customer_name text,
  customer_email text,
  customer_company text,
  customer_wallet text,
  currency text not null default 'USDC',
  subtotal text not null default '0',
  discount text not null default '0',
  tax text not null default '0',
  total text not null default '0',
  issue_date date,
  due_date date,
  notes text,
  payment_terms text,
  payment_link text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_invoices_status_check check (
    status in (
      'DRAFT',
      'SENT',
      'VIEWED',
      'PENDING',
      'PAID',
      'OVERDUE',
      'CANCELLED'
    )
  ),
  constraint business_invoices_currency_check check (
    currency in ('USDC', 'EURC')
  ),
  constraint business_invoices_public_id_unique unique (public_id),
  constraint business_invoices_number_unique unique (wallet_address, invoice_number)
);

create index if not exists business_invoices_wallet_idx
  on public.business_invoices (wallet_address, created_at desc);

create index if not exists business_invoices_wallet_status_idx
  on public.business_invoices (wallet_address, status);

create table if not exists public.business_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.business_invoices(id) on delete cascade,
  description text not null,
  quantity text not null default '1',
  unit_price text not null default '0',
  tax text not null default '0',
  total text not null default '0',
  created_at timestamptz not null default now()
);

create index if not exists business_invoice_items_invoice_idx
  on public.business_invoice_items (invoice_id);

create table if not exists public.business_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.business_invoices(id) on delete restrict,
  tx_hash text not null,
  amount text not null,
  asset text not null,
  status text not null default 'CONFIRMED',
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint business_invoice_payments_tx_unique unique (tx_hash),
  constraint business_invoice_payments_asset_check check (
    asset in ('USDC', 'EURC')
  )
);

create index if not exists business_invoice_payments_invoice_idx
  on public.business_invoice_payments (invoice_id);

alter table public.account_type_history enable row level security;
alter table public.business_account_profiles enable row level security;
alter table public.business_invoices enable row level security;
alter table public.business_invoice_items enable row level security;
alter table public.business_invoice_payments enable row level security;

grant select, insert, update on public.account_type_history to service_role;
grant select, insert, update on public.business_account_profiles to service_role;
grant select, insert, update, delete on public.business_invoices to service_role;
grant select, insert, update, delete on public.business_invoice_items to service_role;
grant select, insert, update on public.business_invoice_payments to service_role;

-- Retire workspace-era business identities so Personal accounts stay clean.
-- Run this in the Supabase SQL editor before using the new Personal/Business account model.
update public.profiles
set default_workspace_id = null
where default_workspace_id in (
  select id from public.workspaces where kind = 'business'
);

delete from public.payment_identities
where kind = 'business';

update public.workspaces
set status = 'archived', updated_at = now()
where kind = 'business' and status = 'active';

delete from public.workspace_invitations
where workspace_id in (select id from public.workspaces where kind = 'business');

alter table public.business_invoices
  add column if not exists customer_username text;

alter table public.business_invoices
  add column if not exists allow_partial_payment boolean not null default false;

alter table public.business_invoices
  add column if not exists amount_received text not null default '0';

alter table public.business_invoices
  add column if not exists overpayment text not null default '0';

alter table public.business_invoices
  drop constraint if exists business_invoices_status_check;

alter table public.business_invoices
  add constraint business_invoices_status_check check (
    status in (
      'DRAFT',
      'SENT',
      'VIEWED',
      'PENDING',
      'PARTIALLY_PAID',
      'PAID',
      'OVERDUE',
      'CANCELLED'
    )
  );

alter table public.business_invoice_items
  add column if not exists discount text not null default '0';
