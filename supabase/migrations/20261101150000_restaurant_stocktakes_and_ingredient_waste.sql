begin;

create table public.restaurant_stocktakes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete restrict,
  inventory_type text not null check (inventory_type in ('ingredient', 'packaged')),
  item_count integer not null check (item_count between 1 and 500),
  variance_count integer not null check (variance_count between 0 and item_count),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, id)
);

create index restaurant_stocktakes_history_idx
  on public.restaurant_stocktakes(org_id, location_id, inventory_type, created_at desc);

create table public.restaurant_stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  stocktake_id uuid not null,
  ingredient_id uuid,
  menu_item_id uuid,
  expected_quantity numeric(14,3) not null check (expected_quantity >= 0),
  counted_quantity numeric(14,3) not null check (counted_quantity >= 0),
  variance numeric(14,3) not null,
  created_at timestamptz not null default now(),
  foreign key (org_id, stocktake_id)
    references public.restaurant_stocktakes(org_id, id) on delete cascade,
  foreign key (org_id, ingredient_id)
    references public.restaurant_ingredients(org_id, id) on delete restrict,
  foreign key (org_id, menu_item_id)
    references public.restaurant_menu_items(org_id, id) on delete restrict,
  check ((ingredient_id is not null and menu_item_id is null)
    or (ingredient_id is null and menu_item_id is not null)),
  check (variance = counted_quantity - expected_quantity)
);

create unique index restaurant_stocktake_lines_ingredient_key
  on public.restaurant_stocktake_lines(org_id, stocktake_id, ingredient_id)
  where ingredient_id is not null;
create unique index restaurant_stocktake_lines_packaged_key
  on public.restaurant_stocktake_lines(org_id, stocktake_id, menu_item_id)
  where menu_item_id is not null;

alter table public.restaurant_stocktakes enable row level security;
alter table public.restaurant_stocktake_lines enable row level security;

create policy "Restaurant stocktakes: members read assigned locations"
  on public.restaurant_stocktakes for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));
create policy "Restaurant stocktake lines: members read assigned locations"
  on public.restaurant_stocktake_lines for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1
      from public.restaurant_stocktakes stocktake
      where stocktake.org_id = restaurant_stocktake_lines.org_id
        and stocktake.id = restaurant_stocktake_lines.stocktake_id
        and public.can_access_org_location(stocktake.org_id, stocktake.location_id)
    )
  );
revoke all on public.restaurant_stocktakes from public, anon, authenticated;
revoke all on public.restaurant_stocktake_lines from public, anon, authenticated;
grant select on public.restaurant_stocktakes to authenticated;
grant select on public.restaurant_stocktake_lines to authenticated;
grant all on public.restaurant_stocktakes to service_role;
grant all on public.restaurant_stocktake_lines to service_role;

alter table public.restaurant_ingredient_movements
  drop constraint if exists restaurant_ingredient_movements_type_check,
  drop constraint if exists restaurant_ingredient_movements_source_check;
alter table public.restaurant_ingredient_movements
  add constraint restaurant_ingredient_movements_type_check
    check (movement_type in ('adjustment', 'consumption', 'purchase_receipt', 'waste')),
  add constraint restaurant_ingredient_movements_source_check
    check (
      (movement_type in ('adjustment', 'waste') and order_id is null and purchase_order_id is null)
      or (movement_type = 'consumption' and order_id is not null and purchase_order_id is null)
      or (movement_type = 'purchase_receipt' and order_id is null and purchase_order_id is not null)
    );

create or replace function public.record_restaurant_ingredient_waste(
  p_org_id uuid,
  p_location_id uuid,
  p_ingredient_id uuid,
  p_quantity numeric,
  p_reason text,
  p_created_by uuid
)
returns public.restaurant_ingredient_stock
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stock_quantity numeric(14,3);
  stock_row public.restaurant_ingredient_stock;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record Restaurant ingredient waste.';
  end if;
  if p_quantity is null or p_quantity <= 0
    or p_quantity <> round(p_quantity, 3)
    or p_quantity > 99999999999.999
    or length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'Enter a positive waste quantity to three decimal places and a reason of no more than 200 characters.';
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
    raise exception 'Restaurant branch not found or inactive.';
  end if;

  insert into public.restaurant_ingredient_stock (org_id, location_id, ingredient_id, quantity)
    values (p_org_id, p_location_id, p_ingredient_id, 0)
    on conflict (org_id, location_id, ingredient_id) do nothing;
  select quantity into stock_quantity
  from public.restaurant_ingredient_stock
  where org_id = p_org_id and location_id = p_location_id and ingredient_id = p_ingredient_id
  for update;
  if stock_quantity < p_quantity then
    raise exception 'Cannot record waste above available stock (% available).', stock_quantity;
  end if;

  update public.restaurant_ingredient_stock
    set quantity = quantity - p_quantity, updated_at = now()
    where org_id = p_org_id and location_id = p_location_id and ingredient_id = p_ingredient_id
    returning * into stock_row;
  insert into public.restaurant_ingredient_movements (
    org_id, location_id, ingredient_id, movement_type, quantity_delta,
    balance_after, reason, created_by
  ) values (
    p_org_id, p_location_id, p_ingredient_id, 'waste',
    -p_quantity, stock_row.quantity, btrim(p_reason), p_created_by
  );
  return stock_row;
end;
$$;

revoke all on function public.record_restaurant_ingredient_waste(uuid, uuid, uuid, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_restaurant_ingredient_waste(uuid, uuid, uuid, numeric, text, uuid)
  to service_role;

create or replace function public.record_restaurant_stocktake(
  p_org_id uuid,
  p_location_id uuid,
  p_inventory_type text,
  p_counts jsonb,
  p_created_by uuid
)
returns table (stocktake_id uuid, item_count integer, variance_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  count_entry jsonb;
  item_uuid uuid;
  counted numeric(14,3);
  counted_value numeric;
  expected numeric(14,3);
  variance_value numeric(14,3);
  count_total integer;
  count_variances integer := 0;
  new_stocktake_id uuid := gen_random_uuid();
  item_label text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record Restaurant stocktakes.';
  end if;
  if p_inventory_type is null or p_inventory_type not in ('ingredient', 'packaged') or p_created_by is null then
    raise exception 'Provide a valid stocktake with 1 to 500 item counts.';
  end if;
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' then
    raise exception 'Provide a valid stocktake with 1 to 500 item counts.';
  end if;
  count_total := jsonb_array_length(p_counts);
  if count_total not between 1 and 500 then
    raise exception 'Provide a valid stocktake with 1 to 500 item counts.';
  end if;
  if not exists (
    select 1 from public.business_locations
    where org_id = p_org_id and id = p_location_id and is_active
  ) then
    raise exception 'Restaurant branch not found or inactive.';
  end if;
  for count_entry in select value from jsonb_array_elements(p_counts)
  loop
    if jsonb_typeof(count_entry) <> 'object' then
      raise exception 'Each stocktake line must include a valid item and a non-negative count to three decimal places.';
    end if;
    if coalesce(count_entry->>'itemId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(count_entry->>'countedQuantity', '') !~ '^[0-9]+([.][0-9]{1,3})?$' then
      raise exception 'Each stocktake line must include a valid item and a non-negative count to three decimal places.';
    end if;
    counted_value := (count_entry->>'countedQuantity')::numeric;
    if counted_value > 99999999999.999 then
      raise exception 'Each stocktake line must include a valid item and a non-negative count to three decimal places.';
    end if;
    item_uuid := (count_entry->>'itemId')::uuid;
    if (select count(*) from jsonb_array_elements(p_counts) entries
        where lower(entries.value->>'itemId') = lower(count_entry->>'itemId')) <> 1 then
      raise exception 'Each stocktake item can only be counted once.';
    end if;
    if p_inventory_type = 'ingredient' then
      if not exists (select 1 from public.restaurant_ingredients
        where org_id = p_org_id and id = item_uuid and is_active) then
        raise exception 'An active restaurant ingredient was not found.';
      end if;
      insert into public.restaurant_ingredient_stock (org_id, location_id, ingredient_id, quantity)
        values (p_org_id, p_location_id, item_uuid, 0)
        on conflict (org_id, location_id, ingredient_id) do nothing;
    else
      if not exists (select 1 from public.restaurant_menu_items
        where org_id = p_org_id and id = item_uuid and item_type = 'packaged' and is_active) then
        raise exception 'An active packaged restaurant item was not found.';
      end if;
      insert into public.restaurant_packaged_item_stock (org_id, location_id, menu_item_id, quantity)
        values (p_org_id, p_location_id, item_uuid, 0)
        on conflict (org_id, location_id, menu_item_id) do nothing;
    end if;
  end loop;

  for count_entry in
    select value from jsonb_array_elements(p_counts) entries
    order by entries.value->>'itemId'
  loop
    item_uuid := (count_entry->>'itemId')::uuid;
    counted := (count_entry->>'countedQuantity')::numeric;
    if p_inventory_type = 'ingredient' then
      select quantity into expected from public.restaurant_ingredient_stock
      where org_id = p_org_id and location_id = p_location_id and ingredient_id = item_uuid
      for update;
    else
      select quantity into expected from public.restaurant_packaged_item_stock
      where org_id = p_org_id and location_id = p_location_id and menu_item_id = item_uuid
      for update;
    end if;
    variance_value := counted - expected;
    if variance_value <> 0 then count_variances := count_variances + 1; end if;
  end loop;

  insert into public.restaurant_stocktakes (
    id, org_id, location_id, inventory_type, item_count, variance_count, created_by
  ) values (
    new_stocktake_id, p_org_id, p_location_id, p_inventory_type, count_total, count_variances, p_created_by
  );

  for count_entry in
    select value from jsonb_array_elements(p_counts) entries
    order by entries.value->>'itemId'
  loop
    item_uuid := (count_entry->>'itemId')::uuid;
    counted := (count_entry->>'countedQuantity')::numeric;
    if p_inventory_type = 'ingredient' then
      select quantity into expected from public.restaurant_ingredient_stock
      where org_id = p_org_id and location_id = p_location_id and ingredient_id = item_uuid
      for update;
      variance_value := counted - expected;
      insert into public.restaurant_stocktake_lines (
        org_id, stocktake_id, ingredient_id, expected_quantity, counted_quantity, variance
      ) values (p_org_id, new_stocktake_id, item_uuid, expected, counted, variance_value);
      update public.restaurant_ingredient_stock
        set quantity = counted, updated_at = now()
        where org_id = p_org_id and location_id = p_location_id and ingredient_id = item_uuid;
      if variance_value <> 0 then
        select name into item_label from public.restaurant_ingredients
          where org_id = p_org_id and id = item_uuid;
        insert into public.restaurant_ingredient_movements (
          org_id, location_id, ingredient_id, movement_type, quantity_delta,
          balance_after, reason, created_by
        ) values (
          p_org_id, p_location_id, item_uuid, 'adjustment', variance_value,
          counted, 'Stock count ' || new_stocktake_id::text || ': ' || item_label, p_created_by
        );
      end if;
    else
      select quantity into expected from public.restaurant_packaged_item_stock
      where org_id = p_org_id and location_id = p_location_id and menu_item_id = item_uuid
      for update;
      variance_value := counted - expected;
      insert into public.restaurant_stocktake_lines (
        org_id, stocktake_id, menu_item_id, expected_quantity, counted_quantity, variance
      ) values (p_org_id, new_stocktake_id, item_uuid, expected, counted, variance_value);
      update public.restaurant_packaged_item_stock
        set quantity = counted, updated_at = now()
        where org_id = p_org_id and location_id = p_location_id and menu_item_id = item_uuid;
      if variance_value <> 0 then
        select name into item_label from public.restaurant_menu_items
          where org_id = p_org_id and id = item_uuid;
        insert into public.restaurant_packaged_item_movements (
          org_id, location_id, menu_item_id, movement_type, quantity_delta,
          balance_after, reason, created_by
        ) values (
          p_org_id, p_location_id, item_uuid, 'adjustment', variance_value,
          counted, 'Stock count ' || new_stocktake_id::text || ': ' || item_label, p_created_by
        );
      end if;
    end if;
  end loop;
  return query select new_stocktake_id, count_total, count_variances;
end;
$$;

revoke all on function public.record_restaurant_stocktake(uuid, uuid, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.record_restaurant_stocktake(uuid, uuid, text, jsonb, uuid)
  to service_role;

commit;
