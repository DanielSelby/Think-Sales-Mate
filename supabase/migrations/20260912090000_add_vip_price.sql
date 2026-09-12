alter table public.products
  add column if not exists vip_price numeric(12, 2),
  add column if not exists special_price numeric(12, 2);
