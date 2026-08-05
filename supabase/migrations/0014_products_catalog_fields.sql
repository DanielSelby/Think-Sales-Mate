-- SalesMate ERP — Products catalog fields for the full Products page:
-- category/brand/supplier as simple text (no separate supplier or brand
-- directory yet — that would be its own module), a barcode field, and a
-- link to the branch/warehouse (business_locations) that stocks it.
alter table public.products
  add column category text,
  add column brand text,
  add column supplier text,
  add column barcode text,
  add column location_id uuid references public.business_locations(id);

create index idx_products_category on public.products(org_id, category);
create index idx_products_location on public.products(location_id);