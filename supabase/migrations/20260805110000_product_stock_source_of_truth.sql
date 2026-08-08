-- Makes product_stock_levels the real source of truth for inventory, and
-- turns products.stock_quantity into an auto-synced cache (a fast total for
-- list views / low-stock alerts) that nothing writes to directly anymore.
--
-- Fixes a real bug: adjust_product_stock() from the sale-returns and
-- purchase-receiving work only ever touched products.stock_quantity, so
-- per-location numbers were silently going stale.

begin;

-- 1. Make (product_id, location_id) unique so we can upsert quantities ----
create unique index if not exists product_stock_levels_product_location_idx
  on public.product_stock_levels (product_id, location_id);

-- 1b. Remember which location a sale return restocked, so reversing it
-- later (restoring a sale to "completed") decrements the same place
-- instead of re-guessing a location at reversal time.
alter table public.sale_return_items
  add column if not exists location_id uuid references public.business_locations (id);

-- 2. Keep products.stock_quantity as an auto-synced total --------------
create or replace function public.recalc_product_stock_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_product_id uuid;
begin
  affected_product_id := coalesce(new.product_id, old.product_id);

  update public.products
  set stock_quantity = (
    select coalesce(sum(quantity), 0)
    from public.product_stock_levels
    where product_id = affected_product_id
  )
  where id = affected_product_id;

  return null;
end;
$$;

drop trigger if exists product_stock_levels_sync_total on public.product_stock_levels;
create trigger product_stock_levels_sync_total
  after insert or update or delete on public.product_stock_levels
  for each row
  execute function public.recalc_product_stock_quantity();

-- 3. Backfill: seed per-location rows from the existing stock_quantity ---
-- Assigns all pre-existing stock to each product's org's primary location
-- (falling back to any active location if no primary is set). Products
-- that already have a product_stock_levels row are left untouched.
insert into public.product_stock_levels (org_id, product_id, location_id, quantity)
select
  p.org_id,
  p.id,
  loc.id,
  p.stock_quantity
from public.products p
join lateral (
  select id
  from public.business_locations bl
  where bl.org_id = p.org_id and bl.is_active = true
  order by bl.is_primary desc, bl.created_at asc
  limit 1
) loc on true
where p.stock_quantity <> 0
  and not exists (
    select 1 from public.product_stock_levels psl where psl.product_id = p.id
  )
on conflict (product_id, location_id) do nothing;

-- The insert above fires the sync trigger per row, so stock_quantity is
-- already correct — no separate backfill update needed.

-- 4. Location-aware stock adjustment (replaces the old global-only one) --
create or replace function public.adjust_product_stock_at_location(
  p_product_id uuid,
  p_location_id uuid,
  p_org_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_stock_levels (org_id, product_id, location_id, quantity, updated_at)
  values (p_org_id, p_product_id, p_location_id, p_delta, now())
  on conflict (product_id, location_id)
  do update set
    quantity = product_stock_levels.quantity + excluded.quantity,
    updated_at = now();
end;
$$;

-- Old global-only function is superseded — drop it so nothing can
-- accidentally call it and silently skip the per-location table again.
drop function if exists public.adjust_product_stock(uuid, numeric);

commit;