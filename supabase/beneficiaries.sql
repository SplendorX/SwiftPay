create table if not exists public.beneficiaries (
  owner_wallet text not null,
  name text not null,
  beneficiary_wallet text not null,
  primary key (owner_wallet, beneficiary_wallet)
);

alter table public.beneficiaries enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.beneficiaries to service_role;
