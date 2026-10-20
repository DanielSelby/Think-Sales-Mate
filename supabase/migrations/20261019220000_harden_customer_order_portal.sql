begin;

create or replace view public.public_product_catalog as
select
  p.id,
  p.org_id,
  p.name,
  p.category,
  p.brand,
  p.unit_price,
  p.stock_quantity,
  p.sku,
  p.image_urls
from public.products p
where p.is_active = true;

drop policy if exists "customer_portal_settings: anyone can read" on public.customer_portal_settings;
drop policy if exists "customer_portal_settings_read_all" on public.customer_portal_settings;
create policy "customer_portal_settings: members can read"
  on public.customer_portal_settings for select
  using (public.is_org_member(org_id));

drop policy if exists "customer_orders_guest_select_by_token" on public.customer_orders;
drop policy if exists "customer_orders: guests can track by token" on public.customer_orders;
drop policy if exists "customer_orders_guest_insert" on public.customer_orders;
drop policy if exists "customer_orders: guests can place orders" on public.customer_orders;
drop policy if exists "customer_order_items_guest_select" on public.customer_order_items;
drop policy if exists "customer_order_items: guests can read their order's items" on public.customer_order_items;
drop policy if exists "customer_order_items_guest_insert" on public.customer_order_items;
drop policy if exists "customer_order_items: guests can insert at checkout" on public.customer_order_items;
drop policy if exists "timeline: guests can read by order" on public.customer_order_timeline;
drop policy if exists "timeline: guests can insert on order creation" on public.customer_order_timeline;

create or replace function public.place_customer_portal_order(
  p_org_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_guest_email text,
  p_delivery_address text,
  p_delivery_option text,
  p_location_id uuid,
  p_notes text,
  p_voice_note_url text,
  p_items jsonb
)
returns table(order_id uuid, order_number text, access_token uuid, branch_name text, total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.customer_portal_settings%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_access_token uuid;
  v_branch_name text;
  v_delivery_fee numeric(12, 2) := 0;
  v_subtotal numeric(12, 2);
  v_total numeric(12, 2);
  v_customer_id uuid;
  v_today text := to_char(clock_timestamp(), 'YYMMDD');
  v_item_count integer;
begin
  if p_org_id is null then
    raise exception 'Invalid store.';
  end if;
  if nullif(btrim(p_guest_name), '') is null or length(btrim(p_guest_name)) > 160 then
    raise exception 'Enter a valid customer name.';
  end if;
  if nullif(btrim(p_guest_phone), '') is null or length(btrim(p_guest_phone)) > 40 then
    raise exception 'Enter a valid phone number.';
  end if;
  if p_guest_email is not null and length(btrim(p_guest_email)) > 254 then
    raise exception 'Email address is too long.';
  end if;
  if nullif(btrim(p_delivery_address), '') is null or length(btrim(p_delivery_address)) > 1000 then
    raise exception 'Enter a valid delivery or contact address.';
  end if;
  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'Order notes are too long.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Your cart is empty.';
  end if;

  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if v_item_count = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if v_item_count > 100 then
    raise exception 'Your order contains too many items.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    where item.product_id is null
       or item.quantity is null
       or item.quantity <= 0
       or item.quantity > 1000000
  ) then
    raise exception 'One or more item quantities are invalid.';
  end if;
  if (
    select count(*) from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  ) <> (
    select count(distinct item.product_id) from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  ) then
    raise exception 'Your cart contains duplicate items. Please refresh and try again.';
  end if;

  select * into v_settings
  from public.customer_portal_settings
  where org_id = p_org_id;
  if not found or not v_settings.is_enabled then
    raise exception 'Ordering is currently unavailable.';
  end if;
  if v_settings.schedule_enabled and not (
    case
      when v_settings.active_from = v_settings.active_until then true
      when v_settings.active_from < v_settings.active_until then
        (now() at time zone v_settings.schedule_timezone)::time >= v_settings.active_from
        and (now() at time zone v_settings.schedule_timezone)::time < v_settings.active_until
      else
        (now() at time zone v_settings.schedule_timezone)::time >= v_settings.active_from
        or (now() at time zone v_settings.schedule_timezone)::time < v_settings.active_until
    end
  ) then
    raise exception 'Ordering is currently unavailable.';
  end if;

  if v_settings.allow_customer_location_selection
     and exists (
       select 1 from public.business_locations
       where org_id = p_org_id and is_active = true
     )
     and p_location_id is null then
    raise exception 'Please select a branch location.';
  end if;

  if p_location_id is not null and v_settings.allow_customer_location_selection then
    select name into v_branch_name
    from public.business_locations
    where id = p_location_id and org_id = p_org_id and is_active = true;
    if not found then
      raise exception 'The selected branch is unavailable. Please choose another branch.';
    end if;
  else
    p_location_id := null;
  end if;

  if v_settings.allow_customer_select_delivery then
    case p_delivery_option
      when 'Standard Delivery' then v_delivery_fee := 5;
      when 'Express Delivery' then v_delivery_fee := 15;
      when 'Pickup / In-Store Collection' then v_delivery_fee := 0;
      else raise exception 'Choose a valid delivery method.';
    end case;
  else
    p_delivery_option := null;
  end if;

  perform p.id
  from public.products p
  join jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    on item.product_id = p.id
  where p.org_id = p_org_id and p.is_active = true
  for share of p;

  if (
    select count(*)
    from public.products p
    join jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
      on item.product_id = p.id
    where p.org_id = p_org_id and p.is_active = true
  ) <> v_item_count then
    raise exception 'One or more products are no longer available. Please refresh your cart.';
  end if;

  if p_location_id is null then
    if exists (
      select 1
      from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
      join public.products p on p.id = item.product_id and p.org_id = p_org_id and p.is_active = true
      where p.stock_quantity < item.quantity
    ) then
      raise exception 'There is not enough stock for one or more items. Please update your cart.';
    end if;
  elsif exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    left join public.product_stock_levels stock
      on stock.product_id = item.product_id
      and stock.location_id = p_location_id
      and stock.org_id = p_org_id
    where coalesce(stock.quantity, 0) < item.quantity
  ) then
    raise exception 'The selected branch does not have enough stock for one or more items. Please update your cart or choose another branch.';
  end if;

  select coalesce(sum(item.quantity * p.unit_price), 0)
  into v_subtotal
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  join public.products p on p.id = item.product_id and p.org_id = p_org_id and p.is_active = true;
  v_total := v_subtotal + v_delivery_fee;

  select c.id into v_customer_id
  from public.customers c
  where c.org_id = p_org_id and c.phone = btrim(p_guest_phone)
  limit 1;

  v_order_number := 'ORD-' || v_today || '-' ||
    lpad(nextval('public.customer_order_number_seq')::text, 6, '0');

  insert into public.customer_orders (
    org_id, order_number, customer_id, guest_name, guest_phone, guest_email,
    delivery_address, delivery_option, delivery_fee, notes, voice_note_url,
    subtotal, total, status, payment_status, delivery_status, location_id
  )
  values (
    p_org_id, v_order_number, v_customer_id, btrim(p_guest_name), btrim(p_guest_phone),
    nullif(btrim(p_guest_email), ''), btrim(p_delivery_address), p_delivery_option,
    v_delivery_fee, nullif(btrim(p_notes), ''), nullif(p_voice_note_url, ''),
    v_subtotal, v_total, 'new', 'unpaid', 'not_shipped', p_location_id
  )
  returning id, customer_orders.access_token into v_order_id, v_access_token;

  insert into public.customer_order_items (
    order_id, org_id, product_id, product_name, quantity, unit_price, line_total
  )
  select
    v_order_id, p_org_id, p.id, p.name, item.quantity, p.unit_price,
    item.quantity * p.unit_price
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  join public.products p on p.id = item.product_id and p.org_id = p_org_id and p.is_active = true;

  insert into public.customer_order_timeline (
    order_id, org_id, title, actor_name, status, notes
  )
  values (
    v_order_id, p_org_id, 'Order Created', btrim(p_guest_name), 'completed',
    case when p_location_id is not null
      then 'Submitted with branch selection: ' || coalesce(v_branch_name, 'Branch')
      else 'Submitted to Admin review queue'
    end
  );

  return query select v_order_id, v_order_number, v_access_token, v_branch_name, v_total;
end;
$$;

create or replace function public.confirm_customer_portal_order_received(
  p_access_token uuid,
  p_feedback text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.customer_orders%rowtype;
  v_feedback text := left(btrim(coalesce(p_feedback, '')), 1000);
begin
  if p_access_token is null then
    return 'invalid';
  end if;
  select * into v_order
  from public.customer_orders
  where access_token = p_access_token
  for update;
  if not found then
    return 'invalid';
  end if;
  if exists (
    select 1 from public.customer_portal_settings
    where org_id = v_order.org_id and allow_view_order_status = false
  ) then
    return 'invalid';
  end if;
  if v_order.customer_received_at is not null then
    return 'already_received';
  end if;
  if v_order.status <> 'completed' then
    return 'not_completed';
  end if;

  update public.customer_orders
  set customer_received_at = now(),
      customer_feedback = nullif(v_feedback, '')
  where id = v_order.id;

  insert into public.customer_order_timeline (
    order_id, org_id, title, actor_name, status, notes
  )
  values (
    v_order.id, v_order.org_id, 'Order Received', 'Customer', 'received',
    coalesce(nullif(v_feedback, ''), 'Customer confirmed receipt.')
  );

  return 'success';
end;
$$;

revoke all on function public.place_customer_portal_order(uuid, text, text, text, text, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.place_customer_portal_order(uuid, text, text, text, text, text, uuid, text, text, jsonb) to service_role;

revoke all on function public.confirm_customer_portal_order_received(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_customer_portal_order_received(uuid, text) to service_role;

commit;
