-- Business verification reviews.
--
-- A business with a complete profile submits a registration number or tax
-- ID. SwiftPay checks it against a free official register where one exists
-- (EU VIES, France, UK Companies House, Norway, Australia ABR, GLEIF LEI) and
-- otherwise queues it for a reviewer at /admin/business-verifications.
-- A business is shown as verified only once a review is APPROVED.
--
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table public.business_account_profiles
  add column if not exists review_status text not null default 'NONE';

alter table public.business_account_profiles
  drop constraint if exists business_account_profiles_review_status_check;
alter table public.business_account_profiles
  add constraint business_account_profiles_review_status_check check (
    review_status in ('NONE', 'PENDING', 'APPROVED', 'REJECTED')
  );

create table if not exists public.business_verification_submissions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  -- Snapshot of what was checked, so a later profile edit can't rewrite it.
  business_name text not null,
  country_code text not null,
  id_type text not null,
  id_number text not null,
  status text not null default 'PENDING',
  method text not null default 'AUTOMATIC',
  -- Which register answered ("EU VIES", "GLEIF"...), and what it said.
  source text,
  registry_name text,
  registry_status text,
  -- Why it was routed to a person, or why it was rejected.
  note text,
  reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_verification_status_check check (
    status in ('PENDING', 'APPROVED', 'REJECTED')
  ),
  constraint business_verification_method_check check (
    method in ('AUTOMATIC', 'MANUAL')
  ),
  constraint business_verification_type_check check (
    id_type in ('VAT', 'REGISTRATION', 'TAX', 'LEI')
  )
);

create index if not exists business_verification_wallet_idx
  on public.business_verification_submissions (wallet_address, created_at desc);

create index if not exists business_verification_pending_idx
  on public.business_verification_submissions (created_at)
  where status = 'PENDING';

-- One registration can verify one business: a second business presenting an
-- already-approved number can't be approved with it.
create unique index if not exists business_verification_approved_unique
  on public.business_verification_submissions (country_code, id_type, id_number)
  where status = 'APPROVED';

-- Server-only table: the service role reads and writes it; no public access.
alter table public.business_verification_submissions enable row level security;

-- The server reads and writes this table with the service role; without the
-- grant every request fails with "permission denied" (42501).
grant all privileges on table public.business_verification_submissions to postgres, service_role;
