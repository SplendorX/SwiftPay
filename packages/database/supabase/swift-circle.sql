-- SwiftCircle: collaborative financial workspace
-- Additive only. Do not alter existing SwiftPay financial tables destructively.
-- Run in Supabase SQL editor. Service role only.
-- Identity: user_wallet is the SwiftPay user id (checksum-normalized lowercase address).

-- ─── Circles ────────────────────────────────────────────────────────────────
create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  creator_user_wallet text not null,
  host_user_wallet text not null,
  currency text not null default 'USDC',
  visibility text not null default 'private',
  status text not null default 'active',
  financial_frozen boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circles_name_len check (char_length(name) between 1 and 80),
  constraint circles_description_len check (
    description is null or char_length(description) <= 280
  ),
  constraint circles_status_check check (status in ('active', 'archived')),
  constraint circles_visibility_check check (visibility in ('private')),
  constraint circles_currency_check check (currency in ('USDC', 'EURC'))
);

create index if not exists circles_host_idx
  on public.circles (host_user_wallet, status, created_at desc);

create index if not exists circles_creator_idx
  on public.circles (creator_user_wallet, created_at desc);

-- ─── Members ────────────────────────────────────────────────────────────────
create table if not exists public.circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  user_wallet text not null,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_members_role_check check (role in ('host', 'admin', 'member')),
  constraint circle_members_status_check check (
    status in ('active', 'removed', 'left')
  ),
  constraint circle_members_unique unique (circle_id, user_wallet)
);

create index if not exists circle_members_circle_idx
  on public.circle_members (circle_id);

create index if not exists circle_members_user_idx
  on public.circle_members (user_wallet);

create index if not exists circle_members_active_idx
  on public.circle_members (circle_id, status)
  where status = 'active';

-- ─── Invitations ────────────────────────────────────────────────────────────
create table if not exists public.circle_invitations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  inviter_user_wallet text not null,
  invitee_user_wallet text not null,
  invitee_username text,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint circle_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')
  )
);

create index if not exists circle_invitations_invitee_idx
  on public.circle_invitations (invitee_user_wallet, status, created_at desc);

create index if not exists circle_invitations_circle_idx
  on public.circle_invitations (circle_id, status, created_at desc);

create unique index if not exists circle_invitations_pending_uidx
  on public.circle_invitations (circle_id, invitee_user_wallet)
  where status = 'pending';

-- ─── Chat ───────────────────────────────────────────────────────────────────
create table if not exists public.circle_messages (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  sender_user_wallet text,
  message_type text not null default 'text',
  content text not null default '',
  reply_to_message_id uuid references public.circle_messages(id) on delete set null,
  delivery_state text not null default 'sent',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint circle_messages_type_check check (
    message_type in ('text', 'system', 'financial_card')
  ),
  constraint circle_messages_delivery_check check (
    delivery_state in ('sent', 'delivered')
  ),
  constraint circle_messages_content_len check (char_length(content) <= 4000)
);

create index if not exists circle_messages_circle_created_idx
  on public.circle_messages (circle_id, created_at);

create table if not exists public.circle_message_reads (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  user_wallet text not null,
  last_read_message_id uuid references public.circle_messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  constraint circle_message_reads_unique unique (circle_id, user_wallet)
);

create table if not exists public.circle_message_reports (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  message_id uuid not null references public.circle_messages(id) on delete restrict,
  reporter_user_wallet text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint circle_message_reports_reason_len check (char_length(reason) between 1 and 280),
  constraint circle_message_reports_unique unique (message_id, reporter_user_wallet)
);

-- ─── Payments ───────────────────────────────────────────────────────────────
create table if not exists public.circle_payment_intents (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  sender_user_wallet text not null,
  total_amount text not null,
  total_amount_units text not null,
  asset text not null default 'USDC',
  payment_mode text not null,
  note text,
  status text not null default 'proposed',
  idempotency_key text not null,
  risk_decision text not null default 'ALLOW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_payment_mode_check check (
    payment_mode in ('individual', 'multiple', 'everyone', 'equal_split', 'custom_split')
  ),
  constraint circle_payment_status_check check (
    status in (
      'proposed',
      'executing',
      'submitted',
      'confirmed',
      'failed',
      'cancelled'
    )
  ),
  constraint circle_payment_asset_check check (asset in ('USDC', 'EURC'))
);

create unique index if not exists circle_payment_intents_idem_uidx
  on public.circle_payment_intents (sender_user_wallet, idempotency_key);

create index if not exists circle_payment_intents_circle_idx
  on public.circle_payment_intents (circle_id, created_at desc);

create table if not exists public.circle_payment_recipients (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.circle_payment_intents(id) on delete restrict,
  recipient_user_wallet text not null,
  amount text not null,
  amount_units text not null,
  transaction_id text,
  tx_hash text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_payment_recipients_status_check check (
    status in ('pending', 'submitted', 'confirmed', 'failed')
  )
);

create index if not exists circle_payment_recipients_intent_idx
  on public.circle_payment_recipients (payment_intent_id);

-- ─── Payment requests ───────────────────────────────────────────────────────
create table if not exists public.circle_payment_request_groups (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  requester_user_wallet text not null,
  per_amount text not null,
  per_amount_units text not null,
  asset text not null default 'USDC',
  reason text,
  target_mode text not null,
  status text not null default 'open',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_request_group_mode_check check (
    target_mode in ('one', 'multiple', 'everyone')
  ),
  constraint circle_request_group_status_check check (
    status in ('open', 'completed', 'cancelled', 'expired')
  )
);

create table if not exists public.circle_payment_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  group_id uuid references public.circle_payment_request_groups(id) on delete restrict,
  requester_user_wallet text not null,
  target_user_wallet text not null,
  amount text not null,
  amount_units text not null,
  asset text not null default 'USDC',
  reason text,
  status text not null default 'pending',
  expires_at timestamptz,
  payment_intent_id uuid references public.circle_payment_intents(id) on delete set null,
  transaction_id text,
  tx_hash text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_payment_requests_status_check check (
    status in ('pending', 'paid', 'declined', 'cancelled', 'expired')
  )
);

create index if not exists circle_payment_requests_circle_status_idx
  on public.circle_payment_requests (circle_id, status);

create index if not exists circle_payment_requests_target_idx
  on public.circle_payment_requests (target_user_wallet, status, created_at desc);

create unique index if not exists circle_payment_requests_idem_uidx
  on public.circle_payment_requests (requester_user_wallet, idempotency_key)
  where idempotency_key is not null;

-- ─── Circle Save ────────────────────────────────────────────────────────────
create table if not exists public.circle_save_accounts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  status text not null default 'active',
  balance text not null default '0',
  balance_units text not null default '0',
  goal_name text,
  target_amount text,
  target_amount_units text,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_save_accounts_status_check check (
    status in ('active', 'frozen', 'closed')
  ),
  constraint circle_save_accounts_circle_uidx unique (circle_id)
);

create table if not exists public.circle_save_contributions (
  id uuid primary key default gen_random_uuid(),
  circle_save_account_id uuid not null references public.circle_save_accounts(id) on delete restrict,
  circle_id uuid not null references public.circles(id) on delete restrict,
  user_wallet text not null,
  amount text not null,
  amount_units text not null,
  asset text not null default 'USDC',
  transaction_id text,
  tx_hash text,
  status text not null default 'proposed',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_save_contributions_status_check check (
    status in ('proposed', 'submitted', 'confirmed', 'failed', 'cancelled')
  )
);

create unique index if not exists circle_save_contributions_idem_uidx
  on public.circle_save_contributions (user_wallet, idempotency_key);

create index if not exists circle_save_contributions_account_idx
  on public.circle_save_contributions (circle_save_account_id, created_at desc);

create unique index if not exists circle_save_contributions_tx_hash_uidx
  on public.circle_save_contributions (lower(tx_hash))
  where tx_hash is not null;

create index if not exists circle_save_contributions_submitted_idx
  on public.circle_save_contributions (circle_id, status)
  where status = 'submitted';

-- ─── Circle Save pockets (fixed / flexible, like Swift+Save) ────────────────
create table if not exists public.circle_save_pockets (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  circle_save_account_id uuid not null references public.circle_save_accounts(id) on delete restrict,
  created_by_wallet text not null,
  name text not null,
  icon text not null default 'piggy',
  description text,
  target_amount text,
  target_amount_units text,
  current_balance text not null default '0',
  current_balance_units text not null default '0',
  currency text not null default 'USDC',
  status text not null default 'active',
  stop_at_target boolean not null default false,
  lock_kind text not null default 'flexible',
  lock_until timestamptz,
  lock_duration_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint circle_save_pockets_name_len check (char_length(name) between 1 and 50),
  constraint circle_save_pockets_description_len check (
    description is null or char_length(description) <= 280
  ),
  constraint circle_save_pockets_status_check check (status in ('active', 'archived')),
  constraint circle_save_pockets_lock_kind_check check (lock_kind in ('flexible', 'fixed')),
  constraint circle_save_pockets_currency_check check (currency in ('USDC', 'EURC'))
);

create index if not exists circle_save_pockets_circle_idx
  on public.circle_save_pockets (circle_id, status, created_at desc);

alter table public.circle_save_contributions
  add column if not exists pocket_id uuid references public.circle_save_pockets(id) on delete restrict;

create index if not exists circle_save_contributions_pocket_idx
  on public.circle_save_contributions (pocket_id, created_at desc)
  where pocket_id is not null;

alter table public.circle_withdrawal_proposals
  add column if not exists pocket_id uuid references public.circle_save_pockets(id) on delete restrict;

-- ─── Circle Earn (legacy tables kept; SwiftCircle no longer exposes Earn) ───
create table if not exists public.circle_earn_accounts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  provider text not null default 'ledger',
  external_account_id text,
  principal text not null default '0',
  principal_units text not null default '0',
  current_value text not null default '0',
  current_value_units text not null default '0',
  status text not null default 'active',
  yield_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_earn_accounts_status_check check (
    status in ('active', 'frozen', 'closed')
  ),
  constraint circle_earn_accounts_circle_uidx unique (circle_id)
);

create table if not exists public.circle_earn_contributions (
  id uuid primary key default gen_random_uuid(),
  circle_earn_account_id uuid not null references public.circle_earn_accounts(id) on delete restrict,
  circle_id uuid not null references public.circles(id) on delete restrict,
  user_wallet text not null,
  amount text not null,
  amount_units text not null,
  asset text not null default 'USDC',
  transaction_id text,
  tx_hash text,
  status text not null default 'proposed',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_earn_contributions_status_check check (
    status in ('proposed', 'submitted', 'confirmed', 'failed', 'cancelled')
  )
);

create unique index if not exists circle_earn_contributions_idem_uidx
  on public.circle_earn_contributions (user_wallet, idempotency_key);

create unique index if not exists circle_earn_contributions_tx_hash_uidx
  on public.circle_earn_contributions (lower(tx_hash))
  where tx_hash is not null;

create index if not exists circle_earn_contributions_submitted_idx
  on public.circle_earn_contributions (circle_id, status)
  where status = 'submitted';

-- ─── Withdrawal policies (never hard-code thresholds in app/frontend) ───────
create table if not exists public.circle_withdrawal_policies (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  product_type text not null,
  minimum_amount_units text not null default '0',
  maximum_amount_units text,
  required_approvals integer not null default 1,
  eligible_roles text[] not null default array['host', 'admin']::text[],
  initiator_counts_as_approval boolean not null default false,
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_withdrawal_policies_product_check check (
    product_type in ('save', 'earn')
  ),
  constraint circle_withdrawal_policies_approvals_check check (
    required_approvals >= 0 and required_approvals <= 20
  )
);

create index if not exists circle_withdrawal_policies_circle_idx
  on public.circle_withdrawal_policies (circle_id, product_type, active);

-- ─── Withdrawal proposals + approvals ───────────────────────────────────────
create table if not exists public.circle_withdrawal_proposals (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  product_type text not null,
  initiator_user_wallet text not null,
  amount text not null,
  amount_units text not null,
  asset text not null default 'USDC',
  destination_user_wallet text,
  destination_address text not null,
  reason text,
  policy_id uuid references public.circle_withdrawal_policies(id) on delete restrict,
  policy_version integer not null,
  required_approvals integer not null,
  approval_epoch integer not null default 1,
  status text not null default 'draft',
  risk_decision text not null default 'ALLOW',
  idempotency_key text not null,
  transaction_id text,
  tx_hash text,
  failure_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_withdrawal_proposals_product_check check (
    product_type in ('save', 'earn')
  ),
  constraint circle_withdrawal_proposals_status_check check (
    status in (
      'draft',
      'pending_policy',
      'pending_approval',
      'approved',
      'executing',
      'submitted',
      'confirmed',
      'rejected',
      'cancelled',
      'expired',
      'failed'
    )
  )
);

create unique index if not exists circle_withdrawal_proposals_idem_uidx
  on public.circle_withdrawal_proposals (circle_id, idempotency_key);

create index if not exists circle_withdrawal_proposals_circle_status_idx
  on public.circle_withdrawal_proposals (circle_id, status);

create table if not exists public.circle_withdrawal_approvals (
  id uuid primary key default gen_random_uuid(),
  withdrawal_proposal_id uuid not null references public.circle_withdrawal_proposals(id) on delete restrict,
  circle_id uuid not null references public.circles(id) on delete restrict,
  approver_user_wallet text not null,
  decision text not null,
  approval_epoch integer not null default 1,
  created_at timestamptz not null default now(),
  constraint circle_withdrawal_approvals_decision_check check (
    decision in ('approved', 'rejected')
  ),
  constraint circle_withdrawal_approvals_unique unique (
    withdrawal_proposal_id, approver_user_wallet, approval_epoch
  )
);

create index if not exists circle_withdrawal_approvals_proposal_idx
  on public.circle_withdrawal_approvals (withdrawal_proposal_id);

-- ─── Ledger (canonical accounting; balances are derived) ────────────────────
create table if not exists public.circle_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  actor_user_wallet text,
  entry_type text not null,
  product_type text not null,
  source text not null,
  destination text not null,
  amount_units text not null,
  asset text not null default 'USDC',
  purpose text not null,
  related_entity_type text,
  related_entity_id uuid,
  transaction_id text,
  tx_hash text,
  status text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint circle_ledger_entry_type_check check (
    entry_type in (
      'contribution',
      'payment',
      'withdrawal',
      'refund',
      'failed_transaction',
      'reversal',
      'yield_adjustment'
    )
  ),
  constraint circle_ledger_product_check check (
    product_type in ('personal', 'save', 'earn', 'pay')
  ),
  constraint circle_ledger_status_check check (
    status in ('pending', 'submitted', 'confirmed', 'failed', 'reversed')
  )
);

create unique index if not exists circle_ledger_entries_idem_uidx
  on public.circle_ledger_entries (idempotency_key);

create index if not exists circle_ledger_entries_circle_idx
  on public.circle_ledger_entries (circle_id, created_at desc);

create index if not exists circle_ledger_entries_tx_idx
  on public.circle_ledger_entries (tx_hash)
  where tx_hash is not null;

-- ─── Activity (presentation; never source of financial truth) ────────────────
create table if not exists public.circle_activity (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  actor_user_wallet text,
  activity_type text not null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists circle_activity_circle_idx
  on public.circle_activity (circle_id, created_at desc);

-- ─── Audit (append-only) ────────────────────────────────────────────────────
create table if not exists public.circle_audit_logs (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references public.circles(id) on delete restrict,
  actor_user_wallet text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists circle_audit_logs_circle_created_idx
  on public.circle_audit_logs (circle_id, created_at);

create index if not exists circle_audit_logs_action_idx
  on public.circle_audit_logs (action, created_at desc);

-- ─── Notification events (idempotent) ───────────────────────────────────────
create table if not exists public.circle_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  circle_id uuid references public.circles(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint circle_events_event_id_uidx unique (event_id)
);

create table if not exists public.circle_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  circle_id uuid references public.circles(id) on delete restrict,
  owner_wallet text not null,
  kind text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint circle_notifications_event_owner_uidx unique (event_id, owner_wallet)
);

create index if not exists circle_notifications_owner_idx
  on public.circle_notifications (owner_wallet, created_at desc);

-- ─── Webhook receipts ───────────────────────────────────────────────────────
create table if not exists public.circle_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null,
  tx_hash text,
  provider_transaction_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  constraint circle_webhook_receipts_event_uidx unique (provider_event_id)
);

create index if not exists circle_webhook_receipts_tx_idx
  on public.circle_webhook_receipts (tx_hash)
  where tx_hash is not null;

-- ─── Configurable platform limits (backend-enforced) ────────────────────────
create table if not exists public.circle_platform_limits (
  id text primary key default 'default',
  max_members integer not null default 50,
  max_circles_per_user integer not null default 20,
  max_invitations_per_day integer not null default 50,
  max_payment_amount_units text not null default '100000000000',
  max_request_amount_units text not null default '100000000000',
  max_save_contribution_units text not null default '100000000000',
  max_earn_contribution_units text not null default '100000000000',
  max_withdrawal_amount_units text not null default '100000000000',
  max_pending_withdrawals integer not null default 5,
  invitation_ttl_hours integer not null default 168,
  updated_at timestamptz not null default now()
);

insert into public.circle_platform_limits (id)
values ('default')
on conflict (id) do nothing;

-- ─── Grants + RLS ───────────────────────────────────────────────────────────
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_invitations enable row level security;
alter table public.circle_messages enable row level security;
alter table public.circle_message_reads enable row level security;
alter table public.circle_message_reports enable row level security;
alter table public.circle_payment_intents enable row level security;
alter table public.circle_payment_recipients enable row level security;
alter table public.circle_payment_request_groups enable row level security;
alter table public.circle_payment_requests enable row level security;
alter table public.circle_save_accounts enable row level security;
alter table public.circle_save_contributions enable row level security;
alter table public.circle_save_pockets enable row level security;
alter table public.circle_earn_accounts enable row level security;
alter table public.circle_earn_contributions enable row level security;
alter table public.circle_withdrawal_policies enable row level security;
alter table public.circle_withdrawal_proposals enable row level security;
alter table public.circle_withdrawal_approvals enable row level security;
alter table public.circle_ledger_entries enable row level security;
alter table public.circle_activity enable row level security;
alter table public.circle_audit_logs enable row level security;
alter table public.circle_events enable row level security;
alter table public.circle_notifications enable row level security;
alter table public.circle_webhook_receipts enable row level security;
alter table public.circle_platform_limits enable row level security;

grant usage on schema public to service_role;

grant select, insert, update on public.circles to service_role;
grant select, insert, update on public.circle_members to service_role;
grant select, insert, update on public.circle_invitations to service_role;
grant select, insert, update on public.circle_messages to service_role;
grant select, insert, update on public.circle_message_reads to service_role;
grant select, insert, update on public.circle_message_reports to service_role;
grant select, insert, update on public.circle_payment_intents to service_role;
grant select, insert, update on public.circle_payment_recipients to service_role;
grant select, insert, update on public.circle_payment_request_groups to service_role;
grant select, insert, update on public.circle_payment_requests to service_role;
grant select, insert, update on public.circle_save_accounts to service_role;
grant select, insert, update on public.circle_save_contributions to service_role;
grant select, insert, update on public.circle_save_pockets to service_role;
grant select, insert, update on public.circle_earn_accounts to service_role;
grant select, insert, update on public.circle_earn_contributions to service_role;
grant select, insert, update on public.circle_withdrawal_policies to service_role;
grant select, insert, update on public.circle_withdrawal_proposals to service_role;
grant select, insert, update on public.circle_withdrawal_approvals to service_role;
grant select, insert, update on public.circle_ledger_entries to service_role;
grant select, insert, update, delete on public.circle_activity to service_role;
grant select, insert on public.circle_audit_logs to service_role;
grant select, insert on public.circle_events to service_role;
grant select, insert, update on public.circle_notifications to service_role;
grant select, insert on public.circle_webhook_receipts to service_role;
grant select, insert, update on public.circle_platform_limits to service_role;

-- Inbox kinds used by the existing SwiftPay notification bell.
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

-- ─── Amendments: 500-member cap + SwiftBatch Circle Pay ─────────────────────
alter table public.circle_platform_limits
  alter column max_members set default 500;

update public.circle_platform_limits
set max_members = 500, updated_at = now()
where id = 'default' and max_members < 500;

create index if not exists circle_members_circle_status_idx
  on public.circle_members (circle_id, status);

alter table public.circle_payment_intents
  add column if not exists execution_method text not null default 'single';
alter table public.circle_payment_intents
  add column if not exists swiftbatch_id text;
alter table public.circle_payment_intents
  add column if not exists batch_status text;
alter table public.circle_payment_intents
  add column if not exists recipient_count integer not null default 1;
alter table public.circle_payment_intents
  add column if not exists completed_at timestamptz;

alter table public.circle_payment_intents
  drop constraint if exists circle_payment_status_check;
alter table public.circle_payment_intents
  add constraint circle_payment_status_check check (
    status in (
      'proposed',
      'executing',
      'submitted',
      'confirmed',
      'partially_completed',
      'failed',
      'cancelled'
    )
  );

alter table public.circle_payment_intents
  drop constraint if exists circle_payment_execution_check;
alter table public.circle_payment_intents
  add constraint circle_payment_execution_check check (
    execution_method in ('single', 'swiftbatch')
  );

alter table public.circle_payment_intents
  drop constraint if exists circle_payment_batch_status_check;
alter table public.circle_payment_intents
  add constraint circle_payment_batch_status_check check (
    batch_status is null or batch_status in (
      'created',
      'pending',
      'submitted',
      'processing',
      'completed',
      'partially_completed',
      'failed',
      'cancelled'
    )
  );

create unique index if not exists circle_payment_intents_swiftbatch_uidx
  on public.circle_payment_intents (swiftbatch_id)
  where swiftbatch_id is not null;

-- Serialize Circle joins so active membership cannot exceed the configured cap.
create or replace function public.swift_circle_try_join(
  p_circle_id uuid,
  p_user_wallet text,
  p_max_members integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_existing uuid;
  v_status text;
begin
  perform 1 from public.circles where id = p_circle_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select id, status into v_existing, v_status
  from public.circle_members
  where circle_id = p_circle_id and user_wallet = p_user_wallet
  for update;

  select count(*)::int into v_count
  from public.circle_members
  where circle_id = p_circle_id and status = 'active';

  if v_existing is not null and v_status = 'active' then
    return jsonb_build_object(
      'ok', true,
      'already_member', true,
      'member_count', v_count
    );
  end if;

  if v_count >= p_max_members then
    return jsonb_build_object(
      'ok', false,
      'code', 'MEMBER_LIMIT',
      'member_count', v_count
    );
  end if;

  if v_existing is not null then
    update public.circle_members
    set
      status = 'active',
      role = case when role = 'host' then 'member' else role end,
      joined_at = now(),
      left_at = null,
      updated_at = now()
    where id = v_existing;
  else
    insert into public.circle_members (
      circle_id, user_wallet, role, status, joined_at
    ) values (
      p_circle_id, p_user_wallet, 'member', 'active', now()
    );
  end if;

  select count(*)::int into v_count
  from public.circle_members
  where circle_id = p_circle_id and status = 'active';

  return jsonb_build_object(
    'ok', true,
    'already_member', false,
    'member_count', v_count
  );
end;
$$;

grant execute on function public.swift_circle_try_join(uuid, text, integer) to service_role;
