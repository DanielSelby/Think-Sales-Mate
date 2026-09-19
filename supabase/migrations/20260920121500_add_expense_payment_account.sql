alter table public.expenses
  add column if not exists payment_account text;
