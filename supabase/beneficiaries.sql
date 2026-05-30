create table if not exists public.beneficiaries (
  owner_wallet text not null,
  name text not null,
  beneficiary_wallet text not null,
  primary key (owner_wallet, beneficiary_wallet)
);

alter table public.beneficiaries
  drop constraint if exists beneficiaries_pkey;

alter table public.beneficiaries
  alter column owner_wallet type text using owner_wallet::text,
  alter column name type text using name::text,
  alter column beneficiary_wallet type text using beneficiary_wallet::text;

alter table public.beneficiaries
  alter column owner_wallet set not null,
  alter column name set not null,
  alter column beneficiary_wallet set not null;

alter table public.beneficiaries
  add constraint beneficiaries_pkey
  primary key (owner_wallet, beneficiary_wallet);

alter table public.beneficiaries enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.beneficiaries to service_role;
