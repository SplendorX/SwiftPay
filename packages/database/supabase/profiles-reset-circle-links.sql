-- One-time reset: clear every profile's Circle identity link.
--
-- Before the /api/profile fix, a Circle identity could be linked to any wallet
-- without proof of ownership, and the link grants access to that wallet's
-- private data. This clears all links made under the old rules. Google and
-- email users are re-linked automatically, with proof, the next time the app
-- loads with their Circle session (ensureProfile sends their Circle token).
--
-- Run in the Supabase SQL editor. Adjust the table name if you set
-- SUPABASE_PROFILES_TABLE to something other than "profiles".

-- 1. Preview: how many profiles are linked, and by which sign-in method.
select auth_provider, count(*) as linked_profiles
from public.profiles
where circle_social_uuid is not null
group by auth_provider;

-- 2. Clear the links.
update public.profiles
set circle_social_uuid = null,
    updated_at = now()
where circle_social_uuid is not null;

-- 3. Verify: should return 0.
select count(*) as still_linked
from public.profiles
where circle_social_uuid is not null;
