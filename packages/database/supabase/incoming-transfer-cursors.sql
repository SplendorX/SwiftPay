-- Incoming payment scan cursors.
-- The "payment received" notifications read Transfer events from the Arc RPC
-- (the explorer API is behind a Cloudflare challenge on mainnet). The RPC caps
-- each query at a few thousand blocks, so each wallet remembers the last block
-- it was scanned to and the next scan only reads blocks after it.
create table if not exists public.incoming_transfer_cursors (
  chain_id integer not null,
  wallet_address text not null,
  last_block bigint not null,
  updated_at timestamptz not null default now(),
  primary key (chain_id, wallet_address)
);

alter table public.incoming_transfer_cursors enable row level security;
revoke all on public.incoming_transfer_cursors from anon, authenticated;
grant select, insert, update, delete on public.incoming_transfer_cursors to service_role;

drop policy if exists incoming_transfer_cursors_no_client_access on public.incoming_transfer_cursors;
create policy incoming_transfer_cursors_no_client_access
  on public.incoming_transfer_cursors
  for all
  using (false)
  with check (false);
