-- SalesMate ERP — location code, manager, and email, needed for the
-- richer Locations settings page.
alter table public.business_locations
  add column code text,
  add column manager_name text,
  add column email text;

create unique index idx_business_locations_code on public.business_locations(org_id, code) where code is not null;