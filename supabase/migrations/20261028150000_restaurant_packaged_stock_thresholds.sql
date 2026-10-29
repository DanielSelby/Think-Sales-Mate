begin;

alter table public.restaurant_packaged_item_stock
  add column if not exists minimum_quantity numeric(14,3) not null default 0;

alter table public.restaurant_packaged_item_stock
  drop constraint if exists restaurant_packaged_item_stock_minimum_quantity_check;
alter table public.restaurant_packaged_item_stock
  add constraint restaurant_packaged_item_stock_minimum_quantity_check
  check (minimum_quantity >= 0);

create or replace function public.set_restaurant_packaged_item_minimum_stock(
  p_org_id uuid,
  p_location_id uuid,
  p_menu_item_id uuid,
  p_minimum_quantity numeric
)
returns public.restaurant_packaged_item_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row public.restaurant_packaged_item_stock;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can configure Restaurant packaged stock thresholds.';
  end if;
  if p_minimum_quantity is null or p_minimum_quantity < 0
    or abs(p_minimum_quantity * 1000 - round(p_minimum_quantity * 1000)) > 0.000001 then
    raise exception 'Minimum stock must be non-negative with no more than three decimal places.';
  end if;
  if not exists (
    select 1 from public.restaurant_menu_items
    where org_id = p_org_id and id = p_menu_item_id and item_type = 'packaged'
  ) then
    raise exception 'Packaged restaurant item not found.';
  end if;
  if not exists (
    select 1 from public.business_locations
    where org_id = p_org_id and id = p_location_id and is_active
  ) then
    raise exception 'Restaurant branch not found or inactive.';
  end if;

  insert into public.restaurant_packaged_item_stock (
    org_id, location_id, menu_item_id, quantity, minimum_quantity
  ) values (
    p_org_id, p_location_id, p_menu_item_id, 0, p_minimum_quantity
  )
  on conflict (org_id, location_id, menu_item_id)
  do update set minimum_quantity = excluded.minimum_quantity, updated_at = now()
  returning * into stock_row;
  return stock_row;
end;
$$;

revoke all on function public.set_restaurant_packaged_item_minimum_stock(uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.set_restaurant_packaged_item_minimum_stock(uuid, uuid, uuid, numeric) to service_role;

commit;
