-- Purchases need payment status tracked independently of purchase status
-- (a purchase can be fully "Received" but still "Unpaid"). Mirrors the
-- amount_paid pattern already used on sales.

begin;

alter table public.purchases
  add column if not exists paid_amount numeric(12, 2) not null default 0;

alter table public.purchases
  add constraint purchases_paid_amount_check
    check (paid_amount >= 0 and paid_amount <= total);

commit;