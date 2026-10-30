begin;

alter table public.restaurant_menu_items
  add column if not exists barcode text;

create unique index if not exists restaurant_menu_items_org_barcode_unique_idx
  on public.restaurant_menu_items (org_id, lower(barcode))
  where barcode is not null and btrim(barcode) <> '';

commit;
