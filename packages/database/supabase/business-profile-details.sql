-- Business profiles: year founded and annual volume.
--
-- Optional details set in Settings → Profile, alongside the employee band
-- (stored in the existing business_size column). None of them is required
-- for verification.
--
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table public.business_account_profiles
  add column if not exists year_founded integer,
  add column if not exists annual_volume text;

alter table public.business_account_profiles
  drop constraint if exists business_account_profiles_year_founded_check;
alter table public.business_account_profiles
  add constraint business_account_profiles_year_founded_check check (
    year_founded is null or year_founded between 1800 and 2100
  );
