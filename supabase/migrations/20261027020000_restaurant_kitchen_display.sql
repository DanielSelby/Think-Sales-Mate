begin;

alter table public.restaurant_menu_items
  add column if not exists prep_station text not null default 'kitchen';
alter table public.restaurant_order_items
  add column if not exists prep_station text not null default 'kitchen';

alter table public.restaurant_menu_items
  drop constraint if exists restaurant_menu_items_prep_station_check;
alter table public.restaurant_menu_items
  add constraint restaurant_menu_items_prep_station_check
  check (prep_station in ('kitchen', 'bar', 'dessert'));
alter table public.restaurant_order_items
  drop constraint if exists restaurant_order_items_prep_station_check;
alter table public.restaurant_order_items
  add constraint restaurant_order_items_prep_station_check
  check (prep_station in ('kitchen', 'bar', 'dessert'));

update public.restaurant_order_items order_item
set prep_station = menu_item.prep_station
from public.restaurant_menu_items menu_item
where order_item.org_id = menu_item.org_id
  and order_item.menu_item_id = menu_item.id;

create or replace function public.snapshot_restaurant_prep_station()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.menu_item_id is not null then
    select menu_item.prep_station
    into new.prep_station
    from public.restaurant_menu_items menu_item
    where menu_item.org_id = new.org_id and menu_item.id = new.menu_item_id;
    if not found then
      raise exception 'Restaurant menu item not found for kitchen routing.';
    end if;
  else
    new.prep_station := 'kitchen';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_order_items_snapshot_prep_station_insert on public.restaurant_order_items;
create trigger restaurant_order_items_snapshot_prep_station_insert
  before insert on public.restaurant_order_items
  for each row execute function public.snapshot_restaurant_prep_station();
drop trigger if exists restaurant_order_items_snapshot_prep_station_update on public.restaurant_order_items;
create trigger restaurant_order_items_snapshot_prep_station_update
  before update of menu_item_id on public.restaurant_order_items
  for each row execute function public.snapshot_restaurant_prep_station();

revoke all on function public.snapshot_restaurant_prep_station() from public, anon, authenticated;

commit;
