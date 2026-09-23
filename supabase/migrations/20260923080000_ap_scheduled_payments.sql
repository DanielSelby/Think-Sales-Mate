alter table public.purchases
  add column if not exists scheduled_payment_date date,
  add column if not exists scheduled_payment_method text;

create index if not exists purchases_scheduled_payment_idx
  on public.purchases (org_id, scheduled_payment_date)
  where scheduled_payment_date is not null;
