create table if not exists public.profiles (
  wallet_address text primary key,
  username text not null,
  circle_social_uuid text,
  display_name text,
  avatar_url text,
  auth_provider text not null default 'external',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  alter column wallet_address type text using wallet_address::text,
  alter column username type text using username::text,
  alter column circle_social_uuid type text using circle_social_uuid::text,
  alter column display_name type text using display_name::text,
  alter column avatar_url type text using avatar_url::text,
  alter column auth_provider type text using auth_provider::text;

alter table public.profiles
  alter column wallet_address set not null,
  alter column username set not null,
  alter column auth_provider set not null;

alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  add column if not exists locale text not null default 'en';

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles
  add column if not exists account_type_selected boolean not null default false;

alter table public.profiles
  add column if not exists default_workspace_id uuid;

alter table public.profiles
  add column if not exists tour_completed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_bio_len;

alter table public.profiles
  add constraint profiles_bio_len check (
    bio is null or char_length(bio) <= 160
  );

alter table public.profiles
  drop constraint if exists profiles_locale_len;

alter table public.profiles
  add constraint profiles_locale_len check (char_length(locale) between 2 and 12);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

create unique index if not exists profiles_circle_social_uuid_idx
  on public.profiles (circle_social_uuid)
  where circle_social_uuid is not null;

alter table public.profiles enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.profiles to service_role;
