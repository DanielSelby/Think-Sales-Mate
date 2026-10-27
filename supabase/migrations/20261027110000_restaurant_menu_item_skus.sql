begin;

alter table public.restaurant_menu_items
  add column if not exists sku text;

alter table public.restaurant_menu_items
  drop constraint if exists restaurant_menu_items_sku_length_check,
  add constraint restaurant_menu_items_sku_length_check
    check (sku is null or length(btrim(sku)) between 1 and 80);

create unique index if not exists restaurant_menu_items_org_sku_unique
  on public.restaurant_menu_items(org_id, lower(sku))
  where sku is not null;

commit;
