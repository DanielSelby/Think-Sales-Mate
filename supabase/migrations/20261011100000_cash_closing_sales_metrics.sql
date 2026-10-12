alter table public.cash_closings
  add column if not exists total_sales numeric(12,2),
  add column if not exists credit_sales numeric(12,2),
  add column if not exists cash_customer_e_cash numeric(12,2);
