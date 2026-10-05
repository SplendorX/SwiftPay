-- Wallet transfer history read from the Arc RPC.
-- The explorer API answers server requests with a Cloudflare challenge on
-- mainnet, so Activity's on-chain history (a wallet's own transfers and its
-- ALLIE Agent Wallet's) is read from Transfer events instead and kept here.
-- Each wallet's cursor remembers the newest block read and how far back the
-- history has been filled; every load reads forward from the newest block and
-- fills a little more of the past.
create table if not exists public.wallet_transfer_history (
  chain_id integer not null,
  wallet_address text not null,
  tx_hash text not null,
  log_index integer not null,
  direction text not null,
  counterparty text not null,
  symbol text not null,
  amount text not null,
  block_number bigint not null,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (chain_id, wallet_address, tx_hash, log_index, direction),
  constraint wallet_transfer_history_direction_check check (direction in ('in', 'out'))
);

create index if not exists wallet_transfer_history_recent_idx
  on public.wallet_transfer_history (chain_id, wallet_address, block_number desc);

create table if not exists public.wallet_history_cursors (
  chain_id integer not null,
  wallet_address text not null,
  -- Newest block read so far.
  newest_block bigint not null,
  -- Oldest block read so far; filling stops at floor_block.
  oldest_block bigint not null,
  floor_block bigint not null,
  updated_at timestamptz not null default now(),
  primary key (chain_id, wallet_address)
);

alter table public.wallet_transfer_history enable row level security;
alter table public.wallet_history_cursors enable row level security;
revoke all on public.wallet_transfer_history from anon, authenticated;
revoke all on public.wallet_history_cursors from anon, authenticated;
grant select, insert, update, delete on public.wallet_transfer_history to service_role;
grant select, insert, update, delete on public.wallet_history_cursors to service_role;

drop policy if exists wallet_transfer_history_no_client_access on public.wallet_transfer_history;
create policy wallet_transfer_history_no_client_access
  on public.wallet_transfer_history
  for all
  using (false)
  with check (false);

drop policy if exists wallet_history_cursors_no_client_access on public.wallet_history_cursors;
create policy wallet_history_cursors_no_client_access
  on public.wallet_history_cursors
  for all
  using (false)
  with check (false);
