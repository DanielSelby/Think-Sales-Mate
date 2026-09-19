alter table public.cash_closings
  add column if not exists cash_e_cash numeric(12,2) not null default 0;
