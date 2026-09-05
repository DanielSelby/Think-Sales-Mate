alter type public.transfer_status add value if not exists 'received';

alter table public.stock_transfers
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id);
