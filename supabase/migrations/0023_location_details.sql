-- SalesMate ERP — location code, manager, and email, needed for the
-- richer Locations settings page. Written defensively since `code` (and
-- possibly others) may already exist from an earlier, unseen migration.
alter table public.business_locations
  add column if not exists code text,
  add column if not exists manager_name text,
  add column if not exists email text;

drop index if exists idx_business_locations_code;
create unique index idx_business_locations_code
  on public.business_locations(org_id, code)
  where code is not null;