begin;

alter table public.restaurant_ingredient_stock
  add column if not exists minimum_quantity numeric(14,3) not null default 0;

alter table public.restaurant_ingredient_stock
  drop constraint if exists restaurant_ingredient_stock_minimum_quantity_check,
  add constraint restaurant_ingredient_stock_minimum_quantity_check
    check (minimum_quantity >= 0);

commit;
