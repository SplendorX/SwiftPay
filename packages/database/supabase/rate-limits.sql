-- Shared rate limits.
-- In-memory counters don't hold on serverless: every instance counts on its
-- own. This keeps one atomic counter per key and fixed window in Postgres.
create table if not exists public.rate_limit_windows (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limit_windows enable row level security;
revoke all on public.rate_limit_windows from anon, authenticated;
grant select, insert, update, delete on public.rate_limit_windows to service_role;

drop policy if exists rate_limit_windows_no_client_access on public.rate_limit_windows;
create policy rate_limit_windows_no_client_access
  on public.rate_limit_windows
  for all
  using (false)
  with check (false);

-- Counts one hit and returns true while the key is within its limit.
create or replace function public.consume_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limit_windows as w (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = w.hits + 1
  returning w.hits into v_hits;

  -- Occasional cleanup of finished windows keeps the table small.
  if random() < 0.01 then
    delete from public.rate_limit_windows where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
