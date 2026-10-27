begin;

create unique index if not exists business_locations_org_id_id_key
  on public.business_locations(org_id, id);

alter table public.restaurant_orders
  drop constraint if exists restaurant_orders_status_check,
  add constraint restaurant_orders_status_check
    check (status in ('pending_payment', 'new', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'));

alter table public.restaurant_orders
  alter column created_by drop not null,
  add column if not exists customer_email text,
  add column if not exists delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  add column if not exists order_source text not null default 'staff',
  add column if not exists payment_option text not null default 'pay_at_fulfillment';

alter table public.restaurant_orders
  drop constraint if exists restaurant_orders_order_source_check,
  add constraint restaurant_orders_order_source_check
    check (order_source in ('staff', 'online')),
  drop constraint if exists restaurant_orders_payment_option_check,
  add constraint restaurant_orders_payment_option_check
    check (payment_option in ('pay_at_fulfillment', 'paystack'));

alter table public.restaurant_order_payments
  alter column received_by drop not null,
  add column if not exists payment_provider text,
  add column if not exists payment_reference text;

alter table public.restaurant_order_payments
  drop constraint if exists restaurant_order_payments_provider_check,
  add constraint restaurant_order_payments_provider_check
    check (payment_provider is null or payment_provider = 'paystack');

create unique index if not exists restaurant_order_payments_payment_reference_key
  on public.restaurant_order_payments(payment_reference)
  where payment_reference is not null;

create table if not exists public.restaurant_online_settings (
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  is_enabled boolean not null default false,
  accepts_pickup boolean not null default true,
  accepts_delivery boolean not null default true,
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, location_id),
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete cascade
);

create table if not exists public.restaurant_online_payment_attempts (
  reference text primary key check (length(reference) between 16 and 100),
  org_id uuid not null,
  location_id uuid not null,
  order_id uuid not null,
  confirmation_token uuid not null default gen_random_uuid() unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('GHS', 'NGN', 'USD', 'ZAR')),
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete cascade,
  foreign key (org_id, order_id)
    references public.restaurant_orders(org_id, id) on delete cascade
);

create index if not exists restaurant_online_payment_attempts_order_idx
  on public.restaurant_online_payment_attempts(org_id, order_id);
create index if not exists restaurant_online_payment_attempts_confirmation_idx
  on public.restaurant_online_payment_attempts(confirmation_token);

create table if not exists public.restaurant_online_order_rate_limits (
  location_id uuid not null references public.business_locations(id) on delete cascade,
  ip_hash text not null check (length(ip_hash) = 64),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (location_id, ip_hash, window_started_at)
);

alter table public.restaurant_online_settings enable row level security;
alter table public.restaurant_online_payment_attempts enable row level security;
alter table public.restaurant_online_order_rate_limits enable row level security;

revoke all on public.restaurant_online_settings from anon, authenticated;
revoke all on public.restaurant_online_payment_attempts from anon, authenticated;
revoke all on public.restaurant_online_order_rate_limits from anon, authenticated;

create or replace function public.consume_restaurant_online_order_rate_limit(
  p_location_id uuid,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_window timestamptz := date_trunc('hour', now());
  current_request_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can consume public restaurant order limits.';
  end if;
  if p_location_id is null or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid restaurant order rate-limit key is required.';
  end if;
  if not exists (
    select 1
    from public.business_locations location
    join public.restaurant_online_settings settings
      on settings.org_id = location.org_id and settings.location_id = location.id
    where location.id = p_location_id and location.is_active and settings.is_enabled
  ) then
    raise exception 'This restaurant is not accepting online orders.';
  end if;
  insert into public.restaurant_online_order_rate_limits (
    location_id, ip_hash, window_started_at, request_count
  ) values (p_location_id, p_ip_hash, current_window, 1)
  on conflict (location_id, ip_hash, window_started_at)
  do update set request_count = restaurant_online_order_rate_limits.request_count + 1
  returning restaurant_online_order_rate_limits.request_count into current_request_count;

  delete from public.restaurant_online_order_rate_limits
  where location_id = p_location_id
    and ip_hash = p_ip_hash
    and window_started_at < current_window - interval '24 hours';

  return current_request_count <= 10;
end;
$$;

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
    case when p_fulfillment = 'delivery' then 'delivery' else 'takeaway' end,
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

create or replace function public.cancel_restaurant_online_payment_attempt(p_reference text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_attempt public.restaurant_online_payment_attempts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can cancel public restaurant payment attempts.';
  end if;
  select * into target_attempt
  from public.restaurant_online_payment_attempts
  where reference = p_reference
  for update;
  if not found then return; end if;
  if target_attempt.status = 'pending' then
    update public.restaurant_online_payment_attempts
    set status = 'failed', updated_at = now()
    where reference = p_reference;
    update public.restaurant_orders
    set status = 'cancelled', updated_at = now()
    where org_id = target_attempt.org_id and id = target_attempt.order_id
      and payment_status = 'unpaid' and status = 'pending_payment';
  end if;
end;
$$;

create or replace function public.record_restaurant_online_payment(
  p_reference text,
  p_amount_minor bigint,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_attempt public.restaurant_online_payment_attempts%rowtype;
  target_order public.restaurant_orders%rowtype;
  target_bill public.restaurant_bills%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record online restaurant payments.';
  end if;
  select * into target_attempt
  from public.restaurant_online_payment_attempts
  where reference = p_reference
  for update;
  if not found then
    raise exception 'Restaurant online payment reference was not found.';
  end if;
  if target_attempt.amount_minor <> p_amount_minor
    or target_attempt.currency <> p_currency then
    raise exception 'Restaurant online payment does not match the expected amount and currency.';
  end if;
  if target_attempt.status = 'successful' then
    return target_attempt.order_id;
  end if;
  if target_attempt.status <> 'pending' then
    raise exception 'Restaurant online payment is no longer pending.';
  end if;

  select * into target_order
  from public.restaurant_orders
  where org_id = target_attempt.org_id and id = target_attempt.order_id
  for update;
  if not found or target_order.status <> 'pending_payment'
    or target_order.payment_option <> 'paystack' then
    raise exception 'Restaurant order is unavailable for payment.';
  end if;
  select * into target_bill
  from public.restaurant_bills
  where org_id = target_attempt.org_id and order_id = target_attempt.order_id
    and split_type = 'single'
  for update;
  if not found or target_bill.amount * 100 <> target_attempt.amount_minor then
    raise exception 'Restaurant bill no longer matches the online payment.';
  end if;

  insert into public.restaurant_order_payments (
    org_id, order_id, bill_id, amount, tip_amount, payment_type,
    payment_method, received_by, payment_provider, payment_reference
  ) values (
    target_attempt.org_id, target_attempt.order_id, target_bill.id,
    target_attempt.amount_minor / 100.0, 0, 'payment',
    'other', null, 'paystack', target_attempt.reference
  );

  update public.restaurant_orders
  set payment_status = 'paid', status = 'new', updated_at = now()
  where org_id = target_attempt.org_id and id = target_attempt.order_id;
  update public.restaurant_online_payment_attempts
  set status = 'successful', updated_at = now()
  where reference = target_attempt.reference;

  return target_attempt.order_id;
end;
$$;

create or replace function public.get_restaurant_online_order_confirmation(p_token uuid)
returns table (order_number bigint, payment_status text, payment_attempt_status text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select orders.order_number, orders.payment_status, attempt.status
  from public.restaurant_online_payment_attempts attempt
  join public.restaurant_orders orders
    on orders.org_id = attempt.org_id and orders.id = attempt.order_id
  where attempt.confirmation_token = p_token;
$$;

create or replace function public.get_restaurant_report(
  p_org_id uuid,
  p_location_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  report jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can generate restaurant reports.';
  end if;
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at
    or p_end_at - p_start_at > interval '367 days' then
    raise exception 'Choose a valid report period of no more than 366 days.';
  end if;
  if p_location_ids is null or cardinality(p_location_ids) = 0 then
    return jsonb_build_object(
      'summary', jsonb_build_object('order_count', 0, 'completed_count', 0, 'cancelled_count', 0, 'gross_sales', 0, 'collected_payments', 0, 'average_order', 0),
      'daily', '[]'::jsonb,
      'by_type', '[]'::jsonb,
      'top_items', '[]'::jsonb
    );
  end if;

  with filtered_orders as (
    select id, location_id, order_type, status, total, created_at
    from public.restaurant_orders
    where org_id = p_org_id
      and location_id = any(p_location_ids)
      and status <> 'pending_payment'
      and created_at >= p_start_at
      and created_at < p_end_at
  ),
  summary as (
    select
      count(*) filter (where status <> 'cancelled') as order_count,
      count(*) filter (where status = 'completed') as completed_count,
      count(*) filter (where status = 'cancelled') as cancelled_count,
      coalesce(sum(total) filter (where status <> 'cancelled'), 0) as gross_sales,
      coalesce(avg(total) filter (where status <> 'cancelled'), 0) as average_order
    from filtered_orders
  ),
  paid as (
    select coalesce(sum(case when payment.payment_type = 'payment'
      then payment.amount + payment.tip_amount else -(payment.amount + payment.tip_amount) end), 0) as total
    from public.restaurant_order_payments payment
    join filtered_orders order_row on order_row.id = payment.order_id
    where payment.org_id = p_org_id
  ),
  daily as (
    select
      (created_at at time zone 'UTC')::date as report_date,
      count(*) filter (where status <> 'cancelled') as order_count,
      coalesce(sum(total) filter (where status <> 'cancelled'), 0) as gross_sales
    from filtered_orders
    group by (created_at at time zone 'UTC')::date
  ),
  service_types as (
    select
      order_type,
      count(*) filter (where status <> 'cancelled') as order_count,
      coalesce(sum(total) filter (where status <> 'cancelled'), 0) as gross_sales
    from filtered_orders
    group by order_type
  ),
  item_sales as (
    select
      order_item.item_name,
      coalesce(sum(order_item.quantity), 0) as quantity_sold,
      coalesce(sum(order_item.line_total), 0) as sales
    from public.restaurant_order_items order_item
    join filtered_orders order_row on order_row.id = order_item.order_id
    where order_item.org_id = p_org_id
      and order_row.status <> 'cancelled'
    group by order_item.item_name
    order by sum(order_item.line_total) desc, sum(order_item.quantity) desc
    limit 10
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'order_count', summary.order_count,
      'completed_count', summary.completed_count,
      'cancelled_count', summary.cancelled_count,
      'gross_sales', summary.gross_sales,
      'collected_payments', paid.total,
      'average_order', summary.average_order
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', daily.report_date,
      'order_count', daily.order_count,
      'gross_sales', daily.gross_sales
    ) order by daily.report_date) from daily), '[]'::jsonb),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object(
      'order_type', service_types.order_type,
      'order_count', service_types.order_count,
      'gross_sales', service_types.gross_sales
    ) order by service_types.order_type) from service_types), '[]'::jsonb),
    'top_items', coalesce((select jsonb_agg(jsonb_build_object(
      'item_name', item_sales.item_name,
      'quantity_sold', item_sales.quantity_sold,
      'sales', item_sales.sales
    ) order by item_sales.sales desc) from item_sales), '[]'::jsonb)
  )
  into report
  from summary cross join paid;

  return report;
end;
$$;

revoke all on function public.consume_restaurant_online_order_rate_limit(uuid, text) from public, anon, authenticated;
revoke all on function public.create_restaurant_online_order(uuid, text, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_restaurant_online_payment_attempt(text) from public, anon, authenticated;
revoke all on function public.record_restaurant_online_payment(text, bigint, text) from public, anon, authenticated;
revoke all on function public.get_restaurant_online_order_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.consume_restaurant_online_order_rate_limit(uuid, text) to service_role;
grant execute on function public.create_restaurant_online_order(uuid, text, text, text, text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.cancel_restaurant_online_payment_attempt(text) to service_role;
grant execute on function public.record_restaurant_online_payment(text, bigint, text) to service_role;
grant execute on function public.get_restaurant_online_order_confirmation(uuid) to service_role;

commit;
