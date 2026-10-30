begin;

create or replace function public.create_restaurant_order_with_split_payment(
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
  p_payments jsonb,
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
  payment_entry jsonb;
  entry_amount numeric(12,2);
  payment_total numeric(12,2) := 0;
  allocated_tip numeric(12,2);
  tip_recorded boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create split-paid restaurant POS orders.';
  end if;
  if p_request_key is null
    or p_tip_amount is null
    or p_tip_amount < 0
    or p_tip_amount <> round(p_tip_amount, 2)
    or p_payments is null
    or jsonb_typeof(p_payments) <> 'array'
    or jsonb_array_length(p_payments) < 2
    or jsonb_array_length(p_payments) > 4 then
    raise exception 'Enter two to four valid payments and a valid tip amount.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payments) as split_entries(entry)
    where jsonb_typeof(entry) <> 'object'
      or coalesce(entry->>'method', '') not in ('cash', 'card', 'mobile_money', 'other')
      or coalesce(entry->>'amount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
  ) then
    raise exception 'Each split payment needs a supported method and a non-negative amount with up to two decimals.';
  end if;

  if (select count(distinct entry->>'method') from jsonb_array_elements(p_payments) as split_entries(entry))
    <> jsonb_array_length(p_payments) then
    raise exception 'Choose a different payment method for each split.';
  end if;

  select coalesce(sum((entry->>'amount')::numeric), 0)
  into payment_total
  from jsonb_array_elements(p_payments) as split_entries(entry);

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
  if payment_total <> target_bill.amount then
    raise exception 'Split payments must add up exactly to the order total.';
  end if;

  for payment_entry in select value from jsonb_array_elements(p_payments) as entries(value) loop
    entry_amount := (payment_entry->>'amount')::numeric;
    allocated_tip := case when not tip_recorded then p_tip_amount else 0 end;
    if entry_amount > 0 or allocated_tip > 0 then
      perform public.record_restaurant_bill_payment(
        p_org_id,
        created_order.id,
        target_bill.id,
        entry_amount,
        allocated_tip,
        payment_entry->>'method',
        p_created_by
      );
      tip_recorded := true;
    end if;
  end loop;

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

revoke all on function public.create_restaurant_order_with_split_payment(
  uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, uuid, jsonb, numeric
) from public, anon, authenticated;
grant execute on function public.create_restaurant_order_with_split_payment(
  uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, uuid, jsonb, numeric
) to service_role;

commit;
