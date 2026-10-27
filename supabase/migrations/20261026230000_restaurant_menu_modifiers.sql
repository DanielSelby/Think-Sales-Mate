begin;

create table if not exists public.restaurant_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  menu_item_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer not null default 1 check (max_selections between 1 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, menu_item_id, name),
  foreign key (org_id, menu_item_id)
    references public.restaurant_menu_items(org_id, id) on delete cascade,
  check (min_selections <= max_selections)
);

create table if not exists public.restaurant_modifier_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  price_delta numeric(12,2) not null default 0 check (price_delta >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, group_id, name),
  foreign key (org_id, group_id)
    references public.restaurant_modifier_groups(org_id, id) on delete cascade
);

alter table public.restaurant_order_items
  add column if not exists modifier_selections jsonb not null default '[]'::jsonb;

create index if not exists restaurant_modifier_groups_org_item_idx
  on public.restaurant_modifier_groups(org_id, menu_item_id, is_active);
create index if not exists restaurant_modifier_options_org_group_idx
  on public.restaurant_modifier_options(org_id, group_id, is_active);

alter table public.restaurant_modifier_groups enable row level security;
alter table public.restaurant_modifier_options enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_modifier_groups'
      and policyname = 'Restaurant modifier groups: organization members read'
  ) then
    create policy "Restaurant modifier groups: organization members read"
      on public.restaurant_modifier_groups for select
      using (public.is_org_member(org_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_modifier_options'
      and policyname = 'Restaurant modifier options: organization members read'
  ) then
    create policy "Restaurant modifier options: organization members read"
      on public.restaurant_modifier_options for select
      using (public.is_org_member(org_id));
  end if;
end
$$;

grant select on public.restaurant_modifier_groups, public.restaurant_modifier_options to authenticated;

create or replace function public.create_restaurant_order(
  p_org_id uuid,
  p_location_id uuid,
  p_order_type text,
  p_table_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_notes text,
  p_items jsonb,
  p_created_by uuid
)
returns public.restaurant_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order public.restaurant_orders;
  item jsonb;
  menu_item public.restaurant_menu_items;
  modifier_group record;
  item_quantity numeric(10,2);
  modifier_option_ids uuid[];
  selected_count integer;
  modifier_total numeric(12,2);
  calculated_unit_price numeric(12,2);
  calculated_subtotal numeric(12,2) := 0;
  modifier_snapshot jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create restaurant orders.';
  end if;
  if p_order_type not in ('dine_in', 'takeaway', 'delivery') then
    raise exception 'Choose a valid restaurant order type.';
  end if;
  if p_order_type = 'delivery' and length(btrim(coalesce(p_delivery_address, ''))) = 0 then
    raise exception 'A delivery address is required for delivery orders.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Order items must be supplied as an array.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one menu item to the order.';
  end if;
  if not exists (
    select 1 from public.business_locations location
    where location.id = p_location_id and location.org_id = p_org_id and location.is_active
  ) then
    raise exception 'The selected restaurant location is not active for this organization.';
  end if;
  if p_order_type = 'dine_in' then
    if p_table_id is null or not exists (
      select 1 from public.restaurant_tables dining_table
      where dining_table.id = p_table_id
        and dining_table.org_id = p_org_id
        and dining_table.location_id = p_location_id
        and dining_table.is_active
    ) then
      raise exception 'Choose an active table at the selected location.';
    end if;
  elsif p_table_id is not null then
    raise exception 'Only dine-in orders can be assigned to a table.';
  end if;

  insert into public.restaurant_orders (
    org_id, location_id, order_type, table_id, customer_name, customer_phone, delivery_address,
    notes, subtotal, total, created_by
  ) values (
    p_org_id, p_location_id, p_order_type, p_table_id, nullif(btrim(p_customer_name), ''),
    nullif(btrim(p_customer_phone), ''), nullif(btrim(p_delivery_address), ''), nullif(btrim(p_notes), ''), 0, 0, p_created_by
  ) returning * into created_order;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Each order item must be an object.';
    end if;
    item_quantity := (item->>'quantity')::numeric;
    if item_quantity is null or item_quantity <= 0 or item_quantity > 999 or item_quantity <> trunc(item_quantity) then
      raise exception 'Order item quantities must be whole numbers between 1 and 999.';
    end if;
    select * into menu_item
    from public.restaurant_menu_items
    where id = (item->>'menu_item_id')::uuid
      and org_id = p_org_id
      and is_active;
    if not found then
      raise exception 'A selected menu item is no longer active.';
    end if;

    if jsonb_typeof(coalesce(item->'modifier_option_ids', '[]'::jsonb)) <> 'array' then
      raise exception 'Modifier selections must be an array.';
    end if;
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into modifier_option_ids
    from jsonb_array_elements_text(coalesce(item->'modifier_option_ids', '[]'::jsonb));

    if cardinality(modifier_option_ids) <> (
      select count(distinct selected.value) from unnest(modifier_option_ids) as selected(value)
    ) then
      raise exception 'A modifier option cannot be selected more than once.';
    end if;

    for modifier_group in
      select id, min_selections, max_selections
      from public.restaurant_modifier_groups
      where org_id = p_org_id and menu_item_id = menu_item.id and is_active
    loop
      select count(*) into selected_count
      from public.restaurant_modifier_options selected_option
      where selected_option.org_id = p_org_id
        and selected_option.group_id = modifier_group.id
        and selected_option.is_active
        and selected_option.id = any(modifier_option_ids);
      if selected_count < modifier_group.min_selections or selected_count > modifier_group.max_selections then
        raise exception 'Choose between % and % options for each active modifier group.',
          modifier_group.min_selections, modifier_group.max_selections;
      end if;
    end loop;

    select count(*) into selected_count
    from public.restaurant_modifier_options selected_option
    join public.restaurant_modifier_groups modifier_group
      on modifier_group.org_id = selected_option.org_id and modifier_group.id = selected_option.group_id
    where selected_option.org_id = p_org_id
      and selected_option.id = any(modifier_option_ids)
      and selected_option.is_active
      and modifier_group.menu_item_id = menu_item.id
      and modifier_group.is_active;
    if selected_count <> cardinality(modifier_option_ids) then
      raise exception 'One or more selected modifiers are unavailable for this menu item.';
    end if;

    select
      coalesce(sum(selected_option.price_delta), 0),
      coalesce(jsonb_agg(jsonb_build_object(
        'id', selected_option.id,
        'group_id', selected_option.group_id,
        'group_name', modifier_group.name,
        'name', selected_option.name,
        'price_delta', selected_option.price_delta
      ) order by modifier_group.name, selected_option.name), '[]'::jsonb)
    into modifier_total, modifier_snapshot
    from public.restaurant_modifier_options selected_option
    join public.restaurant_modifier_groups modifier_group
      on modifier_group.org_id = selected_option.org_id and modifier_group.id = selected_option.group_id
    where selected_option.org_id = p_org_id and selected_option.id = any(modifier_option_ids);

    calculated_unit_price := menu_item.price + modifier_total;
    calculated_subtotal := calculated_subtotal + calculated_unit_price * item_quantity;
    insert into public.restaurant_order_items (
      org_id, order_id, menu_item_id, item_name, unit_price, quantity, line_total, notes, modifier_selections
    ) values (
      p_org_id, created_order.id, menu_item.id, menu_item.name, calculated_unit_price,
      item_quantity, calculated_unit_price * item_quantity, nullif(btrim(item->>'notes'), ''), modifier_snapshot
    );
  end loop;

  update public.restaurant_orders
  set subtotal = calculated_subtotal, total = calculated_subtotal, updated_at = now()
  where id = created_order.id
  returning * into created_order;
  return created_order;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_modifier_groups') then
      alter publication supabase_realtime add table public.restaurant_modifier_groups;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_modifier_options') then
      alter publication supabase_realtime add table public.restaurant_modifier_options;
    end if;
  end if;
end
$$;

commit;
