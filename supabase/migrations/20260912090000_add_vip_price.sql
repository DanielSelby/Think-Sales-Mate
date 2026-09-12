alter table public.products
  add column if not exists vip_price numeric(12, 2);
