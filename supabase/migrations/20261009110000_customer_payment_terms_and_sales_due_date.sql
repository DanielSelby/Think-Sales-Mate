alter table public.customers
  add column if not exists payment_terms_days integer not null default 0;

alter table public.customers
  add constraint customers_payment_terms_days_nonnegative
  check (payment_terms_days >= 0);

alter table public.sales
  add column if not exists due_date date;
