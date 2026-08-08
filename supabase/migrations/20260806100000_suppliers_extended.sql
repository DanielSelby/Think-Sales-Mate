-- Extends suppliers for the Supplier Management page: category, country,
-- and a real three-state status (is_active alone can't represent
-- "blacklisted"). is_active is kept and auto-synced via trigger so the
-- existing .eq("is_active", true) queries elsewhere keep working untouched.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_status') then
    create type supplier_status as enum ('active', 'inactive', 'blacklisted');
  end if;
end $$;

alter table public.suppliers
  add column if not exists category text,
  add column if not exists country text,
  add column if not exists status supplier_status not null default 'active';

-- Backfill status from the existing is_active flag
update public.suppliers set status = (case when is_active then 'active' else 'inactive' end)::supplier_status
where status = 'active' and is_active = false;

create or replace function public.sync_supplier_is_active()
returns trigger
language plpgsql
as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end;
$$;

drop trigger if exists suppliers_sync_is_active on public.suppliers;
create trigger suppliers_sync_is_active
  before insert or update of status on public.suppliers
  for each row
  execute function public.sync_supplier_is_active();

create index if not exists suppliers_org_status_idx on public.suppliers (org_id, status);
create index if not exists suppliers_org_category_idx on public.suppliers (org_id, category);

commit;