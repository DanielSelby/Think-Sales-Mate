-- Fixes the recurring "new row for relation product_stock_levels violates
-- check constraint product_stock_levels_quantity_check" error on POS
-- checkout.
--
-- Root cause: adjust_product_stock_at_location() did a plain
-- "insert ... on conflict do update set quantity = quantity + delta" with
-- no read-check-write locking. The app's own pre-check (in completeSale)
-- is a separate query moments earlier — under real concurrency (two
-- terminals selling the last unit(s) of the same product at the same
-- branch at nearly the same time), both prechecks can pass before either
-- sale's stock decrement has landed, and the second decrement then drives
-- the row negative and hits the raw DB constraint. That's a genuine race,
-- not something an app-level precheck can ever fully close.
--
-- The fix: make the check-then-decrement atomic at the DB level with
-- SELECT ... FOR UPDATE, so the second concurrent transaction blocks until
-- the first commits, then sees the real remaining quantity and raises a
-- clean, catchable "insufficient_stock" error instead of tripping the
-- constraint.

begin;

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
declare
  current_qty integer;
begin
  -- Make sure a row exists to lock — on conflict do nothing so two
  -- concurrent first-touches of the same product/location can't both
  -- try to insert.
  insert into public.product_stock_levels (org_id, product_id, location_id, quantity)
  values (p_org_id, p_product_id, p_location_id, 0)
  on conflict (product_id, location_id) do nothing;

  select quantity into current_qty
  from public.product_stock_levels
  where product_id = p_product_id and location_id = p_location_id
  for update;

  if current_qty + p_delta < 0 then
    raise exception 'insufficient_stock: % available, % requested', current_qty, -p_delta;
  end if;

  update public.product_stock_levels
  set quantity = quantity + p_delta, updated_at = now()
  where product_id = p_product_id and location_id = p_location_id;
end;
$$;

-- Minimal extra contact fields for the redesigned "Add a new contact" POS
-- form. Customer Group and Assigned-To from the reference design need
-- their own supporting tables (a customer_groups table; a real staff
-- picker) and aren't added here — the new form omits those two fields
-- rather than fake them against nothing.
alter table public.customers
  add column if not exists contact_type text not null default 'individual' check (contact_type in ('individual', 'business')),
  add column if not exists alternate_phone text,
  add column if not exists landline text,
  add column if not exists contact_id text;

-- The legacy trigger below (from before per-location tracking existed)
-- directly decremented products.stock_quantity on every sale_items insert,
-- with its own "not enough stock" check against the org-wide total only.
-- It's now redundant — products.stock_quantity is an auto-synced cache
-- driven by product_stock_levels (see 20260805110000) — and worse, its
-- branch-blind check could raise a confusing, differently-worded error of
-- its own. Drop it; adjust_product_stock_at_location above is the one
-- source of truth for stock changes now.
drop trigger if exists deduct_stock_after_sale_item on public.sale_items;
drop function if exists public.deduct_stock_on_sale();

commit;