-- SalesMate ERP — real per-location inventory tracking.
--
-- Until now, products.stock_quantity was a single org-wide number, so
-- stock transfers could only log "what moved between branches" without
-- knowing how much of a product actually sat at each branch, or blocking
-- a transfer that would overdraw a specific location. This migration adds
-- that missing layer.
--
-- Semantics for a transfer, matching a real warehouse workflow:
--   • Confirming a transfer (status -> in_transit) deducts stock from the
--     source location immediately — it has physically left.
--   • Marking a transfer "completed" adds that stock to the destination.
--   • Cancelling a transfer that had already left source restores it.
-- products.stock_quantity remains the org-wide total and is left alone by
-- this migration — existing sales/adjustments continue to read/write it
-- exactly as before.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Location types
-- ─────────────────────────────────────────────────────────────────────────
create type public.location_type as enum ('warehouse', 'branch', 'store', 'distribution_center', 'mobile_van');

alter table public.business_locations
  add column location_type public.location_type not null default 'branch';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Per-location stock levels
-- ─────────────────────────────────────────────────────────────────────────
create table public.product_stock_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (product_id, location_id)
);

alter table public.product_stock_levels enable row level security;

create policy "product_stock_levels: members can read"
  on public.product_stock_levels for select
  using (public.is_org_member(org_id));

create policy "product_stock_levels: managers can write"
  on public.product_stock_levels for all
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

create index idx_stock_levels_product on public.product_stock_levels(product_id);
create index idx_stock_levels_location on public.product_stock_levels(location_id);

-- One-time seed: products that already have a warehouse assigned (from the
-- Products catalog's "Warehouse" field) get their full current stock
-- credited to that location. Products with no assigned location are left
-- untracked per-location until someone records a transfer or adjustment
-- that touches them — there's no way to know where unassigned stock
-- physically sits.
insert into public.product_stock_levels (org_id, product_id, location_id, quantity)
select org_id, id, location_id, stock_quantity
from public.products
where location_id is not null and stock_quantity > 0
on conflict (product_id, location_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Deduct from source the moment a transfer's line items are recorded
--    (i.e. the moment a transfer is confirmed).
-- ─────────────────────────────────────────────────────────────────────────
create function public.deduct_transfer_source_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_location uuid;
begin
  select from_location_id into v_from_location
  from public.stock_transfers
  where id = new.transfer_id;

  update public.product_stock_levels
  set quantity = quantity - new.quantity, updated_at = now()
  where product_id = new.product_id and location_id = v_from_location;

  if not found then
    -- No stock on record at this location at all — insert would violate
    -- the quantity >= 0 check and raise a clear "insufficient stock" error.
    insert into public.product_stock_levels (org_id, product_id, location_id, quantity)
    values (new.org_id, new.product_id, v_from_location, -new.quantity);
  end if;

  return new;
end;
$$;

create trigger deduct_transfer_source_stock_trigger
  after insert on public.stock_transfer_items
  for each row execute procedure public.deduct_transfer_source_stock();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Credit the destination when a transfer is marked completed; restore
--    the source if a transfer that already left is cancelled.
-- ─────────────────────────────────────────────────────────────────────────
create function public.apply_transfer_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    for item in select product_id, quantity from public.stock_transfer_items where transfer_id = new.id loop
      insert into public.product_stock_levels (org_id, product_id, location_id, quantity)
      values (new.org_id, item.product_id, new.to_location_id, item.quantity)
      on conflict (product_id, location_id)
      do update set quantity = product_stock_levels.quantity + excluded.quantity, updated_at = now();
    end loop;
  elsif new.status = 'cancelled' and old.status in ('pending', 'in_transit') then
    for item in select product_id, quantity from public.stock_transfer_items where transfer_id = new.id loop
      insert into public.product_stock_levels (org_id, product_id, location_id, quantity)
      values (new.org_id, item.product_id, new.from_location_id, item.quantity)
      on conflict (product_id, location_id)
      do update set quantity = product_stock_levels.quantity + excluded.quantity, updated_at = now();
    end loop;
  end if;

  return new;
end;
$$;

create trigger apply_transfer_status_change_trigger
  after update of status on public.stock_transfers
  for each row execute procedure public.apply_transfer_status_change();