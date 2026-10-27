begin;

create table if not exists public.restaurant_ingredients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  unit text not null check (length(btrim(unit)) between 1 and 20),
  cost_per_unit numeric(12,4) not null default 0 check (cost_per_unit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);

create table if not exists public.restaurant_ingredient_stock (
  org_id uuid not null,
  location_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (org_id, location_id, ingredient_id),
  foreign key (location_id)
    references public.business_locations(id) on delete cascade,
  foreign key (org_id, ingredient_id)
    references public.restaurant_ingredients(org_id, id) on delete restrict
);

create table if not exists public.restaurant_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  menu_item_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric(12,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, menu_item_id, ingredient_id),
  foreign key (org_id, menu_item_id)
    references public.restaurant_menu_items(org_id, id) on delete cascade,
  foreign key (org_id, ingredient_id)
    references public.restaurant_ingredients(org_id, id) on delete restrict
);

create table if not exists public.restaurant_ingredient_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  ingredient_id uuid not null,
  order_id uuid,
  movement_type text not null check (movement_type in ('adjustment', 'consumption')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  balance_after numeric(14,3) not null check (balance_after >= 0),
  reason text not null check (length(btrim(reason)) between 1 and 200),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (location_id)
    references public.business_locations(id) on delete cascade,
  foreign key (org_id, ingredient_id)
    references public.restaurant_ingredients(org_id, id) on delete restrict,
  foreign key (org_id, order_id)
    references public.restaurant_orders(org_id, id) on delete restrict,
  check ((movement_type = 'adjustment' and order_id is null)
    or (movement_type = 'consumption' and order_id is not null))
);

create unique index if not exists restaurant_ingredient_movements_order_consumption_idx
  on public.restaurant_ingredient_movements(org_id, order_id, ingredient_id)
  where movement_type = 'consumption';
create index if not exists restaurant_ingredient_stock_location_idx
  on public.restaurant_ingredient_stock(org_id, location_id, ingredient_id);
create index if not exists restaurant_recipe_ingredients_menu_idx
  on public.restaurant_recipe_ingredients(org_id, menu_item_id);
create index if not exists restaurant_ingredient_movements_history_idx
  on public.restaurant_ingredient_movements(org_id, location_id, ingredient_id, created_at desc);

alter table public.restaurant_ingredients enable row level security;
alter table public.restaurant_ingredient_stock enable row level security;
alter table public.restaurant_recipe_ingredients enable row level security;
alter table public.restaurant_ingredient_movements enable row level security;

drop policy if exists "Restaurant ingredients: organization members read" on public.restaurant_ingredients;
create policy "Restaurant ingredients: organization members read"
  on public.restaurant_ingredients for select
  using (public.is_org_member(org_id));
drop policy if exists "Restaurant ingredient stock: members read assigned locations" on public.restaurant_ingredient_stock;
create policy "Restaurant ingredient stock: members read assigned locations"
  on public.restaurant_ingredient_stock for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));
drop policy if exists "Restaurant recipes: organization members read" on public.restaurant_recipe_ingredients;
create policy "Restaurant recipes: organization members read"
  on public.restaurant_recipe_ingredients for select
  using (public.is_org_member(org_id));
drop policy if exists "Restaurant ingredient movements: members read assigned locations" on public.restaurant_ingredient_movements;
create policy "Restaurant ingredient movements: members read assigned locations"
  on public.restaurant_ingredient_movements for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));

create or replace function public.replace_restaurant_recipe(
  p_org_id uuid,
  p_menu_item_id uuid,
  p_ingredients jsonb
)
returns setof public.restaurant_recipe_ingredients
language plpgsql
security definer
set search_path = public
as $$
declare
  ingredient_spec jsonb;
  ingredient_uuid uuid;
  recipe_quantity numeric(12,3);
  recipe_row public.restaurant_recipe_ingredients;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can update restaurant recipes.';
  end if;
  if coalesce(jsonb_typeof(p_ingredients), '') <> 'array' or jsonb_array_length(p_ingredients) > 100 then
    raise exception 'Provide a valid recipe with no more than 100 ingredients.';
  end if;
  if not exists (
    select 1 from public.restaurant_menu_items
    where org_id = p_org_id and id = p_menu_item_id
  ) then
    raise exception 'Restaurant menu item not found.';
  end if;

  delete from public.restaurant_recipe_ingredients
  where org_id = p_org_id and menu_item_id = p_menu_item_id;

  for ingredient_spec in select value from jsonb_array_elements(p_ingredients)
  loop
    if jsonb_typeof(ingredient_spec) <> 'object'
      or coalesce(ingredient_spec->>'ingredient_id', '') = ''
      or coalesce(ingredient_spec->>'quantity', '') !~ '^[0-9]+([.][0-9]{1,3})?$' then
      raise exception 'Each recipe ingredient must have a valid ingredient and quantity.';
    end if;
    ingredient_uuid := (ingredient_spec->>'ingredient_id')::uuid;
    recipe_quantity := (ingredient_spec->>'quantity')::numeric;
    if recipe_quantity <= 0 or not exists (
      select 1 from public.restaurant_ingredients
      where org_id = p_org_id and id = ingredient_uuid and is_active
    ) then
      raise exception 'Choose an active ingredient and a positive recipe quantity.';
    end if;
    insert into public.restaurant_recipe_ingredients (
      org_id, menu_item_id, ingredient_id, quantity
    ) values (
      p_org_id, p_menu_item_id, ingredient_uuid, recipe_quantity
    ) returning * into recipe_row;
    return next recipe_row;
  end loop;
end;
$$;

create or replace function public.adjust_restaurant_ingredient_stock(
  p_org_id uuid,
  p_location_id uuid,
  p_ingredient_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_created_by uuid
)
returns public.restaurant_ingredient_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row public.restaurant_ingredient_stock;
  next_quantity numeric(14,3);
  reason_text text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can adjust restaurant ingredient stock.';
  end if;
  reason_text := btrim(coalesce(p_reason, ''));
  if p_quantity_delta is null or p_quantity_delta = 0
    or p_quantity_delta <> round(p_quantity_delta, 3)
    or length(reason_text) not between 1 and 200 then
    raise exception 'Enter a non-zero stock quantity to three decimal places and a reason.';
  end if;
  if not exists (
    select 1 from public.restaurant_ingredients
    where org_id = p_org_id and id = p_ingredient_id and is_active
  ) then
    raise exception 'Active restaurant ingredient not found.';
  end if;
  if not exists (
    select 1 from public.business_locations
    where org_id = p_org_id and id = p_location_id and is_active
  ) then
    raise exception 'Active branch not found for this organization.';
  end if;

  insert into public.restaurant_ingredient_stock (org_id, location_id, ingredient_id, quantity)
  values (p_org_id, p_location_id, p_ingredient_id, 0)
  on conflict (org_id, location_id, ingredient_id) do nothing;
  select * into stock_row
  from public.restaurant_ingredient_stock
  where org_id = p_org_id and location_id = p_location_id and ingredient_id = p_ingredient_id
  for update;
  next_quantity := stock_row.quantity + p_quantity_delta;
  if next_quantity < 0 then
    raise exception 'Stock adjustment would make ingredient quantity negative.';
  end if;
  update public.restaurant_ingredient_stock
  set quantity = next_quantity, updated_at = now()
  where org_id = p_org_id and location_id = p_location_id and ingredient_id = p_ingredient_id
  returning * into stock_row;
  insert into public.restaurant_ingredient_movements (
    org_id, location_id, ingredient_id, movement_type, quantity_delta,
    balance_after, reason, created_by
  ) values (
    p_org_id, p_location_id, p_ingredient_id, 'adjustment', p_quantity_delta,
    next_quantity, reason_text, p_created_by
  );
  return stock_row;
end;
$$;

create or replace function public.consume_restaurant_recipe_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  required_ingredient record;
  stock_row public.restaurant_ingredient_stock;
  next_quantity numeric(14,3);
begin
  if new.payment_status <> 'paid' then
    raise exception 'Record full payment before completing the order.';
  end if;
  for required_ingredient in
    select recipe.ingredient_id, ingredient.name,
      sum(recipe.quantity * order_item.quantity)::numeric(14,3) as required_quantity
    from public.restaurant_order_items order_item
    join public.restaurant_recipe_ingredients recipe
      on recipe.org_id = order_item.org_id and recipe.menu_item_id = order_item.menu_item_id
    join public.restaurant_ingredients ingredient
      on ingredient.org_id = recipe.org_id and ingredient.id = recipe.ingredient_id
    where order_item.org_id = new.org_id and order_item.order_id = new.id
      and order_item.kitchen_status <> 'cancelled'
    group by recipe.ingredient_id, ingredient.name
    order by recipe.ingredient_id
  loop
    select * into stock_row
    from public.restaurant_ingredient_stock
    where org_id = new.org_id
      and location_id = new.location_id
      and ingredient_id = required_ingredient.ingredient_id
    for update;
    if not found or stock_row.quantity < required_ingredient.required_quantity then
      raise exception 'Insufficient stock for %: need %, available %.',
        required_ingredient.name,
        required_ingredient.required_quantity,
        coalesce(stock_row.quantity, 0);
    end if;
  end loop;

  for required_ingredient in
    select recipe.ingredient_id, ingredient.name,
      sum(recipe.quantity * order_item.quantity)::numeric(14,3) as required_quantity
    from public.restaurant_order_items order_item
    join public.restaurant_recipe_ingredients recipe
      on recipe.org_id = order_item.org_id and recipe.menu_item_id = order_item.menu_item_id
    join public.restaurant_ingredients ingredient
      on ingredient.org_id = recipe.org_id and ingredient.id = recipe.ingredient_id
    where order_item.org_id = new.org_id and order_item.order_id = new.id
      and order_item.kitchen_status <> 'cancelled'
    group by recipe.ingredient_id, ingredient.name
    order by recipe.ingredient_id
  loop
    update public.restaurant_ingredient_stock
    set quantity = quantity - required_ingredient.required_quantity, updated_at = now()
    where org_id = new.org_id and location_id = new.location_id
      and ingredient_id = required_ingredient.ingredient_id
    returning quantity into next_quantity;
    insert into public.restaurant_ingredient_movements (
      org_id, location_id, ingredient_id, order_id, movement_type,
      quantity_delta, balance_after, reason, created_by
    ) values (
      new.org_id, new.location_id, required_ingredient.ingredient_id, new.id, 'consumption',
      -required_ingredient.required_quantity, next_quantity,
      'Consumed for restaurant order', new.created_by
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists restaurant_orders_consume_recipe_stock on public.restaurant_orders;
create trigger restaurant_orders_consume_recipe_stock
  after update of status on public.restaurant_orders
  for each row
  when (old.status is distinct from new.status and new.status = 'completed')
  execute function public.consume_restaurant_recipe_stock();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_ingredients') then
      alter publication supabase_realtime add table public.restaurant_ingredients;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_ingredient_stock') then
      alter publication supabase_realtime add table public.restaurant_ingredient_stock;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_recipe_ingredients') then
      alter publication supabase_realtime add table public.restaurant_recipe_ingredients;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_ingredient_movements') then
      alter publication supabase_realtime add table public.restaurant_ingredient_movements;
    end if;
  end if;
end
$$;

revoke all on function public.replace_restaurant_recipe(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.adjust_restaurant_ingredient_stock(uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.consume_restaurant_recipe_stock() from public, anon, authenticated;
grant execute on function public.replace_restaurant_recipe(uuid, uuid, jsonb) to service_role;
grant execute on function public.adjust_restaurant_ingredient_stock(uuid, uuid, uuid, numeric, text, uuid) to service_role;

commit;
