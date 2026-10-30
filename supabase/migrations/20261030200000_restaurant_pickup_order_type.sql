begin;

alter table public.restaurant_orders
  drop constraint if exists restaurant_orders_order_type_check;

alter table public.restaurant_orders
  add constraint restaurant_orders_order_type_check
  check (order_type in ('dine_in', 'takeaway', 'pickup', 'delivery'));

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
  group_row record;
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
  if p_order_type not in ('dine_in', 'takeaway', 'pickup', 'delivery') then
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

    for group_row in
      select id, min_selections, max_selections
      from public.restaurant_modifier_groups
      where org_id = p_org_id and menu_item_id = menu_item.id and is_active
    loop
      select count(*) into selected_count
      from public.restaurant_modifier_options selected_option
      where selected_option.org_id = p_org_id
        and selected_option.group_id = group_row.id
        and selected_option.is_active
        and selected_option.id = any(modifier_option_ids);
      if selected_count < group_row.min_selections or selected_count > group_row.max_selections then
        raise exception 'Choose between % and % options for each active modifier group.',
          group_row.min_selections, group_row.max_selections;
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

revoke all on function public.create_restaurant_order(uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_restaurant_order(uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid)
  to service_role;

create or replace function public.create_restaurant_online_order(
  p_org_id uuid,
  p_branch_slug text,
  p_fulfillment text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_notes text,
  p_payment_option text,
  p_payment_reference text,
  p_currency text,
  p_items jsonb
)
returns table (
  order_id uuid,
  order_number bigint,
  total numeric,
  amount_minor bigint,
  confirmation_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_location public.business_locations%rowtype;
  online_settings public.restaurant_online_settings%rowtype;
  created_order public.restaurant_orders%rowtype;
  delivery_charge numeric(12,2);
  online_reference text;
  token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create public restaurant orders.';
  end if;
  if p_fulfillment is null or p_fulfillment not in ('pickup', 'delivery') then
    raise exception 'Choose pickup or delivery.';
  end if;
  if p_payment_option is null or p_payment_option not in ('pay_at_fulfillment', 'paystack') then
    raise exception 'Choose a valid payment option.';
  end if;
  if length(btrim(coalesce(p_customer_name, ''))) not between 1 and 120
    or length(btrim(coalesce(p_customer_phone, ''))) not between 7 and 40
    or length(btrim(coalesce(p_customer_email, ''))) not between 3 and 254
    or p_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid name, phone number, and email address.';
  end if;
  if p_fulfillment = 'delivery' and length(btrim(coalesce(p_delivery_address, ''))) not between 1 and 300 then
    raise exception 'A delivery address is required.';
  end if;
  if p_fulfillment = 'pickup' and nullif(btrim(coalesce(p_delivery_address, '')), '') is not null then
    raise exception 'A delivery address is only valid for delivery.';
  end if;
  if length(coalesce(p_notes, '')) > 500 then
    raise exception 'Order notes cannot exceed 500 characters.';
  end if;
  if p_payment_option = 'paystack'
    and (coalesce(p_currency, '') not in ('GHS', 'NGN', 'USD', 'ZAR')
      or length(coalesce(p_payment_reference, '')) not between 16 and 100) then
    raise exception 'Paystack payment details are not valid for this order.';
  end if;

  select location.* into target_location
  from public.business_locations location
  join public.restaurant_online_settings settings
    on settings.org_id = location.org_id and settings.location_id = location.id
  where location.org_id = p_org_id
    and location.customer_portal_slug = p_branch_slug
    and location.is_active
    and settings.is_enabled
  for share of location;
  if not found then
    raise exception 'This restaurant is not accepting online orders.';
  end if;

  select * into online_settings
  from public.restaurant_online_settings
  where org_id = p_org_id and location_id = target_location.id
  for share;
  if (p_fulfillment = 'pickup' and not online_settings.accepts_pickup)
    or (p_fulfillment = 'delivery' and not online_settings.accepts_delivery) then
    raise exception 'This fulfillment option is unavailable at this restaurant.';
  end if;

  delivery_charge := case when p_fulfillment = 'delivery' then online_settings.delivery_fee else 0 end;
  select * into created_order
  from public.create_restaurant_order(
    p_org_id,
    target_location.id,
    case when p_fulfillment = 'delivery' then 'delivery' else 'pickup' end,
    null,
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_notes,
    p_items,
    null
  );

  update public.restaurant_orders orders
  set customer_email = lower(btrim(p_customer_email)),
      order_source = 'online',
      payment_option = p_payment_option,
      status = case when p_payment_option = 'paystack' then 'pending_payment' else 'new' end,
      delivery_fee = delivery_charge,
      total = orders.subtotal + delivery_charge,
      updated_at = now()
  where orders.org_id = p_org_id and orders.id = created_order.id
  returning * into created_order;

  if p_payment_option = 'paystack' then
    if created_order.total <= 0 then
      raise exception 'Paystack cannot process a zero-value order.';
    end if;
    online_reference := p_payment_reference;
    token := gen_random_uuid();
    insert into public.restaurant_online_payment_attempts (
      reference, org_id, location_id, order_id, confirmation_token,
      amount_minor, currency
    ) values (
      online_reference, p_org_id, target_location.id, created_order.id, token,
      round(created_order.total * 100)::bigint, p_currency
    );
  end if;

  return query select
    created_order.id,
    created_order.order_number,
    created_order.total,
    round(created_order.total * 100)::bigint,
    token;
end;
$$;

commit;
