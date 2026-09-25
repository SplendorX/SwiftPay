-- Personal profiles: contact email, country and phone.
--
-- Set in Settings → Profile. Country is shown on the public profile
-- (/u/<username>); contact email and phone are private to the account.
-- Business accounts keep theirs in business_account_profiles.
--
-- Run in the Supabase SQL editor. Adjust the table name if you set
-- SUPABASE_PROFILES_TABLE to something other than "profiles".

alter table public.profiles
  add column if not exists contact_email text,
  add column if not exists country text,
  add column if not exists phone text;

alter table public.profiles
  drop constraint if exists profiles_contact_email_len,
  drop constraint if exists profiles_country_len,
  drop constraint if exists profiles_phone_len;

alter table public.profiles
  add constraint profiles_contact_email_len check (
    contact_email is null or char_length(contact_email) <= 160
  ),
  add constraint profiles_country_len check (
    country is null or char_length(country) <= 80
  ),
  add constraint profiles_phone_len check (
    phone is null or char_length(phone) <= 32
  );
