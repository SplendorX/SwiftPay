-- SwiftPay Business: workspaces, profiles, teams, invitations, payments.
-- Additive. Service role only. Run in Supabase SQL editor after profiles.sql.
-- Account model: one SwiftPay identity → Individual workspace + Business workspaces.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  owner_user_wallet text not null,
  name text not null,
  username text,
  status text not null default 'active',
  payment_wallet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_kind_check check (kind in ('individual', 'business')),
  constraint workspaces_status_check check (status in ('active', 'archived')),
  constraint workspaces_name_len check (char_length(name) between 1 and 80),
  constraint workspaces_username_format check (
    username is null
    or username ~ '^[a-z][a-z0-9_-]{2,29}$'
  )
);

create unique index if not exists workspaces_one_individual_uidx
  on public.workspaces (owner_user_wallet)
  where kind = 'individual' and status = 'active';

create unique index if not exists workspaces_username_lower_uidx
  on public.workspaces (lower(username))
  where username is not null;

create index if not exists workspaces_owner_idx
  on public.workspaces (owner_user_wallet, status, created_at desc);

alter table public.workspaces
  add column if not exists circle_wallet_id text;

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_wallet text not null,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_role_check check (
    role in ('owner', 'admin', 'finance', 'member', 'viewer')
  ),
  constraint workspace_members_status_check check (
    status in ('active', 'invited', 'removed', 'left')
  ),
  constraint workspace_members_unique unique (workspace_id, user_wallet)
);

alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check check (
    role in ('owner', 'admin', 'finance', 'member', 'viewer')
  );

create index if not exists workspace_members_wallet_idx
  on public.workspace_members (user_wallet, status);

create table if not exists public.business_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  description text,
  logo_url text,
  website text,
  category text,
  country text,
  contact_email text,
  contact_phone text,
  address_line text,
  social_links jsonb not null default '{}'::jsonb,
  verification_status text not null default 'UNVERIFIED',
  legal_name text,
  registration_number text,
  tax_identifier text,
  business_type text,
  industry text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_profiles_description_len check (
    description is null or char_length(description) <= 280
  ),
  constraint business_profiles_verification_check check (
    verification_status in (
      'UNVERIFIED',
      'PENDING',
      'VERIFIED',
      'REQUIRES_ACTION',
      'REJECTED',
      'SUSPENDED'
    )
  )
);

alter table public.business_profiles
  add column if not exists legal_name text;
alter table public.business_profiles
  add column if not exists registration_number text;
alter table public.business_profiles
  add column if not exists tax_identifier text;
alter table public.business_profiles
  add column if not exists business_type text;
alter table public.business_profiles
  add column if not exists industry text;

create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  max_members integer not null default 100,
  approval_required boolean not null default true,
  approval_threshold_units text not null default '0',
  required_approvals integer not null default 1,
  approval_policy jsonb not null default '[
    {"up_to": "1000", "required_approvals": 0},
    {"up_to": "10000", "required_approvals": 1},
    {"up_to": null, "required_approvals": 2}
  ]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_settings_max_members_check check (
    max_members between 1 and 500
  ),
  constraint workspace_settings_approvals_check check (
    required_approvals between 1 and 10
  )
);

alter table public.workspace_settings
  add column if not exists approval_policy jsonb not null default '[
    {"up_to": "1000", "required_approvals": 0},
    {"up_to": null, "required_approvals": 1}
  ]'::jsonb;

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  invited_user_wallet text,
  invited_username text,
  role text not null default 'member',
  status text not null default 'pending',
  invited_by_wallet text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  constraint workspace_invitations_role_check check (
    role in ('admin', 'finance', 'member', 'viewer')
  ),
  constraint workspace_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')
  )
);

alter table public.workspace_invitations
  drop constraint if exists workspace_invitations_role_check;

alter table public.workspace_invitations
  add constraint workspace_invitations_role_check check (
    role in ('admin', 'finance', 'member', 'viewer')
  );

create index if not exists workspace_invitations_wallet_idx
  on public.workspace_invitations (invited_user_wallet, status);

create index if not exists workspace_invitations_username_idx
  on public.workspace_invitations (lower(invited_username), status);

-- Global human-readable payment identity. Never expose wallet IDs in the UI.
create table if not exists public.payment_identities (
  username text primary key,
  kind text not null,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  profile_wallet text,
  destination_wallet text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_identities_kind_check check (kind in ('individual', 'business')),
  constraint payment_identities_username_format check (
    username ~ '^[a-z][a-z0-9_-]{2,29}$'
  )
);

create index if not exists payment_identities_wallet_idx
  on public.payment_identities (destination_wallet);

create index if not exists payment_identities_workspace_idx
  on public.payment_identities (workspace_id);

create table if not exists public.business_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  direction text not null,
  asset text not null,
  amount_units text not null,
  amount_display text not null,
  counterparty_name text,
  counterparty_username text,
  counterparty_wallet text,
  memo text,
  approval_status text not null default 'DRAFT',
  transaction_status text not null default 'DRAFT',
  network text not null default 'arc',
  tx_hash text,
  circle_transaction_id text,
  idempotency_key text,
  created_by_wallet text not null,
  submitted_at timestamptz,
  completed_at timestamptz,
  failed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_payments_direction_check check (
    direction in ('incoming', 'outgoing')
  ),
  constraint business_payments_asset_check check (asset in ('USDC', 'EURC')),
  constraint business_payments_approval_check check (
    approval_status in (
      'DRAFT',
      'PENDING_APPROVAL',
      'PARTIALLY_APPROVED',
      'APPROVED',
      'REJECTED',
      'NOT_REQUIRED'
    )
  ),
  constraint business_payments_tx_check check (
    transaction_status in (
      'DRAFT',
      'AUTHORIZATION_REQUIRED',
      'SUBMITTED',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'CANCELLED'
    )
  )
);

create unique index if not exists business_payments_idempotency_uidx
  on public.business_payments (workspace_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists business_payments_workspace_idx
  on public.business_payments (workspace_id, created_at desc);

create table if not exists public.payment_approvals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.business_payments(id) on delete restrict,
  approver_wallet text not null,
  decision text not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint payment_approvals_decision_check check (
    decision in ('approved', 'rejected')
  ),
  constraint payment_approvals_unique unique (payment_id, approver_wallet)
);

create index if not exists payment_approvals_payment_idx
  on public.payment_approvals (payment_id, created_at);

create table if not exists public.business_payment_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  asset text not null default 'USDC',
  amount_display text,
  amount_units text,
  memo text,
  status text not null default 'open',
  created_by_wallet text not null,
  paid_payment_id uuid references public.business_payments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_payment_requests_asset_check check (asset in ('USDC', 'EURC')),
  constraint business_payment_requests_status_check check (
    status in ('open', 'paid', 'cancelled', 'expired')
  )
);

create index if not exists business_payment_requests_workspace_idx
  on public.business_payment_requests (workspace_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.business_profiles enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.payment_identities enable row level security;
alter table public.business_payments enable row level security;
alter table public.payment_approvals enable row level security;
alter table public.business_payment_requests enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.workspaces to service_role;
grant select, insert, update on public.workspace_members to service_role;
grant select, insert, update on public.business_profiles to service_role;
grant select, insert, update on public.workspace_settings to service_role;
grant select, insert, update on public.workspace_invitations to service_role;
grant select, insert, update, delete on public.payment_identities to service_role;
grant select, insert, update on public.business_payments to service_role;
grant select, insert, update on public.payment_approvals to service_role;
grant select, insert, update on public.business_payment_requests to service_role;

-- Append-only audit trail. Never update or delete rows.
create table if not exists public.business_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_wallet text,
  event_type text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists business_audit_logs_workspace_idx
  on public.business_audit_logs (workspace_id, created_at desc);

alter table public.business_audit_logs enable row level security;

grant usage on schema public to service_role;
grant select, insert on public.business_audit_logs to service_role;
