begin;

create table if not exists public.restaurant_pos_order_requests (
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_key uuid not null,
  order_id uuid not null,
  bill_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (org_id, request_key),
  foreign key (org_id, order_id)
    references public.restaurant_orders(org_id, id) on delete cascade,
  foreign key (org_id, bill_id)
    references public.restaurant_bills(org_id, id) on delete cascade
);

alter table public.restaurant_pos_order_requests enable row level security;
revoke all on public.restaurant_pos_order_requests from public, anon, authenticated;
grant all on public.restaurant_pos_order_requests to service_role;

create or replace function public.create_restaurant_order_with_payment(
  p_org_id uuid,
  p_location_id uuid,
  p_order_type text,
  p_table_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_notes text,
  p_items jsonb,
  p_created_by uuid,
  p_request_key uuid,
  p_payment_method text,
  p_tip_amount numeric
)
returns table (
  order_id uuid,
  order_number bigint,
  bill_id uuid,
  payment_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order public.restaurant_orders;
  target_bill public.restaurant_bills;
  previous_request public.restaurant_pos_order_requests;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create paid restaurant POS orders.';
  end if;
  if p_request_key is null
    or p_payment_method is null
    or p_payment_method not in ('cash', 'card', 'mobile_money', 'other')
    or p_tip_amount is null
    or p_tip_amount < 0
    or p_tip_amount <> round(p_tip_amount, 2) then
    raise exception 'Enter a valid payment method and tip amount.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_org_id::text || ':' || p_request_key::text, 0)
  );

  select * into previous_request
  from public.restaurant_pos_order_requests request
  where request.org_id = p_org_id and request.request_key = p_request_key;
  if found then
    return query
      select orders.id, orders.order_number, previous_request.bill_id, orders.payment_status
      from public.restaurant_orders orders
      where orders.org_id = p_org_id and orders.id = previous_request.order_id;
    return;
  end if;

  created_order := public.create_restaurant_order(
    p_org_id,
    p_location_id,
    p_order_type,
    p_table_id,
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_notes,
    p_items,
    p_created_by
  );

  select * into target_bill
  from public.restaurant_bills bill
  where bill.org_id = p_org_id and bill.order_id = created_order.id
  order by bill.created_at, bill.id
  limit 1
  for update;
  if not found then
    raise exception 'Could not find the bill for the new restaurant order.';
  end if;

  if created_order.total > 0 or p_tip_amount > 0 then
    perform public.record_restaurant_bill_payment(
      p_org_id,
      created_order.id,
      target_bill.id,
      created_order.total,
      p_tip_amount,
      p_payment_method,
      p_created_by
    );
  end if;

  if created_order.total = 0 then
    update public.restaurant_orders
    set payment_status = 'paid', updated_at = now()
    where org_id = p_org_id and id = created_order.id
    returning * into created_order;
  else
    select * into created_order
    from public.restaurant_orders
    where org_id = p_org_id and id = created_order.id;
  end if;

  insert into public.restaurant_pos_order_requests (org_id, request_key, order_id, bill_id)
  values (p_org_id, p_request_key, created_order.id, target_bill.id);

  return query
    select created_order.id, created_order.order_number, target_bill.id, created_order.payment_status;
end;
$$;

revoke all on function public.create_restaurant_order_with_payment(
  uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, uuid, text, numeric
) from public, anon, authenticated;
grant execute on function public.create_restaurant_order_with_payment(
  uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, uuid, text, numeric
) to service_role;

commit;
