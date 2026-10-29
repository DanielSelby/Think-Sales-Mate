begin;

alter table public.restaurant_menu_items
  add column if not exists item_type text not null default 'prepared';

alter table public.restaurant_menu_items
  drop constraint if exists restaurant_menu_items_item_type_check;
alter table public.restaurant_menu_items
  add constraint restaurant_menu_items_item_type_check
  check (item_type in ('prepared', 'packaged'));

create table if not exists public.restaurant_packaged_item_stock (
  org_id uuid not null,
  location_id uuid not null references public.business_locations(id) on delete cascade,
  menu_item_id uuid not null,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (org_id, location_id, menu_item_id),
  foreign key (org_id, menu_item_id)
    references public.restaurant_menu_items(org_id, id) on delete cascade
);

create table if not exists public.restaurant_packaged_item_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  menu_item_id uuid not null,
  order_id uuid,
  movement_type text not null check (movement_type in ('adjustment', 'sale')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  balance_after numeric(14,3) not null check (balance_after >= 0),
  reason text not null check (length(btrim(reason)) between 1 and 200),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (location_id) references public.business_locations(id) on delete cascade,
  foreign key (org_id, menu_item_id)
    references public.restaurant_menu_items(org_id, id) on delete restrict,
  foreign key (org_id, order_id)
    references public.restaurant_orders(org_id, id) on delete restrict,
  check ((movement_type = 'adjustment' and order_id is null)
    or (movement_type = 'sale' and order_id is not null))
);

create unique index if not exists restaurant_packaged_item_order_sale_idx
  on public.restaurant_packaged_item_movements(org_id, order_id, menu_item_id)
  where movement_type = 'sale';
create index if not exists restaurant_packaged_item_stock_location_idx
  on public.restaurant_packaged_item_stock(org_id, location_id, menu_item_id);
create index if not exists restaurant_packaged_item_movements_history_idx
  on public.restaurant_packaged_item_movements(org_id, location_id, menu_item_id, created_at desc);

alter table public.restaurant_packaged_item_stock enable row level security;
alter table public.restaurant_packaged_item_movements enable row level security;

drop policy if exists "Restaurant packaged stock: members read assigned locations" on public.restaurant_packaged_item_stock;
create policy "Restaurant packaged stock: members read assigned locations"
  on public.restaurant_packaged_item_stock for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));
drop policy if exists "Restaurant packaged movements: members read assigned locations" on public.restaurant_packaged_item_movements;
create policy "Restaurant packaged movements: members read assigned locations"
  on public.restaurant_packaged_item_movements for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));

create or replace function public.adjust_restaurant_packaged_item_stock(
  p_org_id uuid,
  p_location_id uuid,
  p_menu_item_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_created_by uuid
)
returns public.restaurant_packaged_item_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  current_quantity numeric(14,3);
  next_quantity numeric(14,3);
  stock_row public.restaurant_packaged_item_stock;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can adjust Restaurant packaged stock.';
  end if;
  if p_quantity_delta = 0 or p_quantity_delta is null
    or abs(p_quantity_delta * 1000 - round(p_quantity_delta * 1000)) > 0.000001 then
    raise exception 'Enter a non-zero stock change with no more than three decimal places.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'Enter a stock adjustment reason of no more than 200 characters.';
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

  insert into public.restaurant_packaged_item_stock (org_id, location_id, menu_item_id, quantity)
    values (p_org_id, p_location_id, p_menu_item_id, 0)
    on conflict (org_id, location_id, menu_item_id) do nothing;
  select quantity into current_quantity
    from public.restaurant_packaged_item_stock
    where org_id = p_org_id and location_id = p_location_id and menu_item_id = p_menu_item_id
    for update;
  next_quantity := current_quantity + p_quantity_delta;
  if next_quantity < 0 then
    raise exception 'Stock adjustment would make the balance negative (available: %).', current_quantity;
  end if;
  update public.restaurant_packaged_item_stock
    set quantity = next_quantity, updated_at = now()
    where org_id = p_org_id and location_id = p_location_id and menu_item_id = p_menu_item_id
    returning * into stock_row;
  insert into public.restaurant_packaged_item_movements (
    org_id, location_id, menu_item_id, movement_type, quantity_delta,
    balance_after, reason, created_by
  ) values (
    p_org_id, p_location_id, p_menu_item_id, 'adjustment', p_quantity_delta,
    next_quantity, btrim(p_reason), p_created_by
  );
  return stock_row;
end;
$$;

revoke all on function public.adjust_restaurant_packaged_item_stock(uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.adjust_restaurant_packaged_item_stock(uuid, uuid, uuid, numeric, text, uuid) to service_role;

create or replace function public.prevent_restaurant_packaged_item_recipe()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.restaurant_menu_items
    where org_id = new.org_id and id = new.menu_item_id and item_type = 'packaged'
  ) then
    raise exception 'Packaged resale items cannot have ingredient recipes.';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_packaged_item_recipe_guard on public.restaurant_recipe_ingredients;
create trigger restaurant_packaged_item_recipe_guard
  before insert or update on public.restaurant_recipe_ingredients
  for each row execute function public.prevent_restaurant_packaged_item_recipe();

create or replace function public.prevent_packaging_menu_item_with_recipe()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.item_type = 'packaged' and exists (
    select 1 from public.restaurant_recipe_ingredients
    where org_id = new.org_id and menu_item_id = new.id
  ) then
    raise exception 'Remove this item recipe before changing it to packaged resale.';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_packaged_item_type_recipe_guard on public.restaurant_menu_items;
create trigger restaurant_packaged_item_type_recipe_guard
  before update of item_type on public.restaurant_menu_items
  for each row execute function public.prevent_packaging_menu_item_with_recipe();

create or replace function public.consume_restaurant_recipe_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  required_ingredient record;
  required_packaged_item record;
  stock_row public.restaurant_ingredient_stock;
  packaged_stock_row public.restaurant_packaged_item_stock;
  next_quantity numeric(14,3);
begin
  if new.payment_status <> 'paid' then
    raise exception 'Record full payment before completing the order.';
  end if;

  for required_ingredient in
    select recipe.ingredient_id, ingredient.name,
      sum(recipe.quantity * order_item.quantity)::numeric(14,3) as required_quantity
    from public.restaurant_order_items order_item
    join public.restaurant_menu_items menu_item
      on menu_item.org_id = order_item.org_id and menu_item.id = order_item.menu_item_id
      and menu_item.item_type = 'prepared'
    join public.restaurant_recipe_ingredients recipe
      on recipe.org_id = order_item.org_id and recipe.menu_item_id = order_item.menu_item_id
    join public.restaurant_ingredients ingredient
      on ingredient.org_id = recipe.org_id and ingredient.id = recipe.ingredient_id
    where order_item.org_id = new.org_id and order_item.order_id = new.id
      and order_item.kitchen_status <> 'cancelled'
    group by recipe.ingredient_id, ingredient.name
    order by recipe.ingredient_id
  loop
    select * into stock_row from public.restaurant_ingredient_stock
    where org_id = new.org_id and location_id = new.location_id
      and ingredient_id = required_ingredient.ingredient_id for update;
    if not found or stock_row.quantity < required_ingredient.required_quantity then
      raise exception 'Insufficient stock for %: need %, available %.',
        required_ingredient.name, required_ingredient.required_quantity, coalesce(stock_row.quantity, 0);
    end if;
  end loop;

  for required_packaged_item in
    select order_item.menu_item_id, menu_item.name,
      sum(order_item.quantity)::numeric(14,3) as required_quantity
    from public.restaurant_order_items order_item
    join public.restaurant_menu_items menu_item
      on menu_item.org_id = order_item.org_id and menu_item.id = order_item.menu_item_id
      and menu_item.item_type = 'packaged'
    where order_item.org_id = new.org_id and order_item.order_id = new.id
      and order_item.kitchen_status <> 'cancelled'
    group by order_item.menu_item_id, menu_item.name
    order by order_item.menu_item_id
  loop
    select * into packaged_stock_row from public.restaurant_packaged_item_stock
    where org_id = new.org_id and location_id = new.location_id
      and menu_item_id = required_packaged_item.menu_item_id for update;
    if not found or packaged_stock_row.quantity < required_packaged_item.required_quantity then
      raise exception 'Insufficient packaged stock for %: need %, available %.',
        required_packaged_item.name, required_packaged_item.required_quantity, coalesce(packaged_stock_row.quantity, 0);
    end if;
  end loop;

  for required_ingredient in
    select recipe.ingredient_id,
      sum(recipe.quantity * order_item.quantity)::numeric(14,3) as required_quantity
    from public.restaurant_order_items order_item
    join public.restaurant_menu_items menu_item
      on menu_item.org_id = order_item.org_id and menu_item.id = order_item.menu_item_id
      and menu_item.item_type = 'prepared'
    join public.restaurant_recipe_ingredients recipe
      on recipe.org_id = order_item.org_id and recipe.menu_item_id = order_item.menu_item_id
    where order_item.org_id = new.org_id and order_item.order_id = new.id
      and order_item.kitchen_status <> 'cancelled'
    group by recipe.ingredient_id order by recipe.ingredient_id
  loop
    update public.restaurant_ingredient_stock
      set quantity = quantity - required_ingredient.required_quantity, updated_at = now()
      where org_id = new.org_id and location_id = new.location_id
        and ingredient_id = required_ingredient.ingredient_id returning quantity into next_quantity;
    insert into public.restaurant_ingredient_movements (
      org_id, location_id, ingredient_id, order_id, movement_type,
      quantity_delta, balance_after, reason, created_by
    ) values (
      new.org_id, new.location_id, required_ingredient.ingredient_id, new.id, 'consumption',
      -required_ingredient.required_quantity, next_quantity, 'Consumed for restaurant order', new.created_by
    );
  end loop;

  for required_packaged_item in
    select order_item.menu_item_id, menu_item.name,
      sum(order_item.quantity)::numeric(14,3) as required_quantity
    from public.restaurant_order_items order_item
    join public.restaurant_menu_items menu_item
      on menu_item.org_id = order_item.org_id and menu_item.id = order_item.menu_item_id
      and menu_item.item_type = 'packaged'
    where order_item.org_id = new.org_id and order_item.order_id = new.id
      and order_item.kitchen_status <> 'cancelled'
    group by order_item.menu_item_id, menu_item.name
    order by order_item.menu_item_id
  loop
    update public.restaurant_packaged_item_stock
      set quantity = quantity - required_packaged_item.required_quantity, updated_at = now()
      where org_id = new.org_id and location_id = new.location_id
        and menu_item_id = required_packaged_item.menu_item_id returning quantity into next_quantity;
    insert into public.restaurant_packaged_item_movements (
      org_id, location_id, menu_item_id, order_id, movement_type,
      quantity_delta, balance_after, reason, created_by
    ) values (
      new.org_id, new.location_id, required_packaged_item.menu_item_id, new.id, 'sale',
      -required_packaged_item.required_quantity, next_quantity, 'Sold in restaurant order', new.created_by
    );
  end loop;
  return new;
end;
$$;

commit;
