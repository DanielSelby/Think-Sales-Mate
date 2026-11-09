begin;

alter table public.restaurant_orders
  add column if not exists loyalty_discount numeric(12,2) not null default 0
    check (loyalty_discount >= 0),
  add column if not exists loyalty_points_redeemed integer not null default 0
    check (loyalty_points_redeemed >= 0);

create table if not exists public.restaurant_loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid not null,
  source_payment_id uuid,
  source_key text not null,
  transaction_type text not null
    check (transaction_type in ('earn', 'redeem', 'refund_adjustment', 'cancel_adjustment')),
  points_delta integer not null check (points_delta <> 0),
  created_at timestamptz not null default now(),
  unique (org_id, source_key),
  foreign key (org_id, order_id)
    references public.restaurant_orders(org_id, id) on delete cascade,
  foreign key (source_payment_id)
    references public.restaurant_order_payments(id) on delete restrict
);

create index if not exists restaurant_loyalty_transactions_customer_idx
  on public.restaurant_loyalty_transactions(org_id, customer_id, created_at desc);
create index if not exists restaurant_loyalty_transactions_order_idx
  on public.restaurant_loyalty_transactions(org_id, order_id);
alter table public.restaurant_loyalty_transactions enable row level security;
revoke all on public.restaurant_loyalty_transactions from public, anon, authenticated;
grant all on public.restaurant_loyalty_transactions to service_role;

create or replace function public.update_restaurant_loyalty_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  earned_points integer;
  balance_delta integer;
begin
  if new.customer_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.org_id::text || ':loyalty:' || new.customer_id::text, 0)
  );

  if new.payment_status = 'paid'
    and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid')
    and new.total > 0 then
    earned_points := floor(new.total)::integer;
    if earned_points > 0 then
      insert into public.restaurant_loyalty_transactions (
        org_id, customer_id, order_id, source_key, transaction_type, points_delta
      ) values (
        new.org_id, new.customer_id, new.id, 'order:' || new.id::text || ':earn',
        'earn', earned_points
      ) on conflict (org_id, source_key) do nothing;
    end if;
  end if;

  if new.status = 'cancelled'
    and (tg_op = 'INSERT' or old.status is distinct from 'cancelled') then
    select coalesce(sum(points_delta), 0)::integer into balance_delta
    from public.restaurant_loyalty_transactions
    where org_id = new.org_id and order_id = new.id;
    if balance_delta <> 0 then
      insert into public.restaurant_loyalty_transactions (
        org_id, customer_id, order_id, source_key, transaction_type, points_delta
      ) values (
        new.org_id, new.customer_id, new.id, 'order:' || new.id::text || ':cancel',
        'cancel_adjustment', -balance_delta
      ) on conflict (org_id, source_key) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists restaurant_orders_update_loyalty on public.restaurant_orders;
create trigger restaurant_orders_update_loyalty
  after insert or update of customer_id, payment_status, status
  on public.restaurant_orders
  for each row execute function public.update_restaurant_loyalty_for_order();

create or replace function public.update_restaurant_loyalty_for_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.restaurant_orders;
  total_refunds numeric(12,2);
  earned_points integer;
  current_points integer;
  adjustment integer;
begin
  if new.payment_type <> 'refund' then
    return new;
  end if;

  select * into order_row
  from public.restaurant_orders
  where org_id = new.org_id and id = new.order_id;
  if not found or order_row.customer_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(order_row.org_id::text || ':loyalty:' || order_row.customer_id::text, 0)
  );

  select coalesce(sum(amount), 0) into total_refunds
  from public.restaurant_order_payments
  where org_id = new.org_id and order_id = new.order_id and payment_type = 'refund';

  earned_points := case when order_row.status = 'cancelled' then 0
    else floor(greatest(order_row.total - total_refunds, 0))::integer end;
  select coalesce(sum(points_delta), 0)::integer into current_points
  from public.restaurant_loyalty_transactions
  where org_id = new.org_id and order_id = new.order_id
    and transaction_type in ('earn', 'refund_adjustment', 'cancel_adjustment');
  adjustment := earned_points - current_points;

  if adjustment <> 0 then
    insert into public.restaurant_loyalty_transactions (
      org_id, customer_id, order_id, source_payment_id, source_key,
      transaction_type, points_delta
    ) values (
      new.org_id, order_row.customer_id, new.order_id, new.id,
      'refund:' || new.id::text, 'refund_adjustment', adjustment
    ) on conflict (org_id, source_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_order_payments_update_loyalty on public.restaurant_order_payments;
create trigger restaurant_order_payments_update_loyalty
  after insert on public.restaurant_order_payments
  for each row execute function public.update_restaurant_loyalty_for_refund();

create or replace function public.get_restaurant_loyalty_balance(
  p_org_id uuid,
  p_customer_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can read Restaurant loyalty balances.';
  end if;
  if not exists (
    select 1 from public.customers
    where org_id = p_org_id and id = p_customer_id
  ) then
    raise exception 'Customer not found.';
  end if;
  return greatest(coalesce((
    select sum(points_delta)::integer
    from public.restaurant_loyalty_transactions
    where org_id = p_org_id and customer_id = p_customer_id
  ), 0), 0);
end;
$$;
revoke all on function public.get_restaurant_loyalty_balance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_restaurant_loyalty_balance(uuid, uuid) to service_role;

create or replace function public.create_restaurant_order_with_loyalty(
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
  p_customer_id uuid,
  p_request_key uuid,
  p_payments jsonb,
  p_tip_amount numeric,
  p_points_to_redeem integer,
  p_expected_total numeric
)
returns table (
  order_id uuid,
  order_number bigint,
  bill_id uuid,
  payment_status text,
  points_earned integer,
  points_redeemed integer,
  loyalty_discount numeric
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
  balance_points integer;
  discount_amount numeric(12,2);
  earned integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create Restaurant POS orders.';
  end if;
  if p_request_key is null
    or p_points_to_redeem is null or p_points_to_redeem < 0
    or p_expected_total is null or p_expected_total < 0
    or p_expected_total <> round(p_expected_total, 2)
    or p_tip_amount is null or p_tip_amount < 0 or p_tip_amount <> round(p_tip_amount, 2)
    or p_payments is null or jsonb_typeof(p_payments) <> 'array'
    or jsonb_array_length(p_payments) > 4 then
    raise exception 'Enter valid payment, tip, and loyalty values.';
  end if;
  if p_points_to_redeem > 0 and p_customer_id is null then
    raise exception 'Select an existing customer to redeem loyalty points.';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where org_id = p_org_id and id = p_customer_id
  ) then
    raise exception 'The selected loyalty customer is not in this organization.';
  end if;
  if jsonb_array_length(p_payments) = 0 and p_tip_amount <> 0 then
    raise exception 'Tips cannot be recorded on an unpaid order.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payments) as split_entries(entry)
    where jsonb_typeof(entry) <> 'object'
      or coalesce(entry->>'method', '') not in ('cash', 'card', 'mobile_money', 'other')
      or coalesce(entry->>'amount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or (entry ? 'account_id' and coalesce(entry->>'account_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ) then
    raise exception 'Each payment needs a supported method, valid amount, and account selection.';
  end if;
  if jsonb_array_length(p_payments) > 1 and (
    select count(distinct entry->>'method') from jsonb_array_elements(p_payments) as split_entries(entry)
  ) <> jsonb_array_length(p_payments) then
    raise exception 'Choose a different payment method for each split.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_org_id::text || ':' || p_request_key::text, 0)
  );
  select * into previous_request
  from public.restaurant_pos_order_requests request
  where request.org_id = p_org_id and request.request_key = p_request_key;
  if found then
    return query
      select orders.id, orders.order_number, previous_request.bill_id, orders.payment_status,
        coalesce((
          select sum(transaction.points_delta)::integer
          from public.restaurant_loyalty_transactions transaction
          where transaction.org_id = p_org_id and transaction.order_id = orders.id
            and transaction.transaction_type in ('earn', 'refund_adjustment', 'cancel_adjustment')
        ), 0),
        orders.loyalty_points_redeemed, orders.loyalty_discount
      from public.restaurant_orders orders
      where orders.org_id = p_org_id and orders.id = previous_request.order_id;
    return;
  end if;

  if p_customer_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_org_id::text || ':loyalty:' || p_customer_id::text, 0)
    );
    select greatest(coalesce(sum(points_delta), 0), 0)::integer into balance_points
    from public.restaurant_loyalty_transactions
    where org_id = p_org_id and customer_id = p_customer_id;
    if p_points_to_redeem > balance_points then
      raise exception 'The customer does not have enough loyalty points.';
    end if;
  end if;

  created_order := public.create_restaurant_order(
    p_org_id, p_location_id, p_order_type, p_table_id, p_customer_name,
    p_customer_phone, p_delivery_address, p_notes, p_items, p_created_by
  );
  if round(created_order.total, 2) <> p_expected_total then
    raise exception 'Menu prices changed while this order was offline. Review and recreate the order.';
  end if;
  if p_customer_id is not null then
    update public.restaurant_orders
    set customer_id = p_customer_id
    where org_id = p_org_id and id = created_order.id
    returning * into created_order;
  end if;

  select * into target_bill
  from public.restaurant_bills bill
  where bill.org_id = p_org_id and bill.order_id = created_order.id
  order by bill.created_at, bill.id limit 1 for update;
  if not found then
    raise exception 'Could not find the bill for the new Restaurant order.';
  end if;

  discount_amount := round(p_points_to_redeem::numeric / 100, 2);
  if discount_amount > target_bill.amount then
    raise exception 'The loyalty redemption cannot exceed the order total.';
  end if;
  update public.restaurant_bills
  set amount = amount - discount_amount, updated_at = now()
  where org_id = p_org_id and id = target_bill.id
  returning * into target_bill;
  update public.restaurant_orders
  set total = target_bill.amount, loyalty_discount = discount_amount,
      loyalty_points_redeemed = p_points_to_redeem, updated_at = now()
  where org_id = p_org_id and id = created_order.id
  returning * into created_order;

  if p_points_to_redeem > 0 then
    insert into public.restaurant_loyalty_transactions (
      org_id, customer_id, order_id, source_key, transaction_type, points_delta
    ) values (
      p_org_id, p_customer_id, created_order.id, 'order:' || created_order.id::text || ':redeem',
      'redeem', -p_points_to_redeem
    );
  end if;

  select coalesce(sum((entry->>'amount')::numeric), 0)
  into payment_total
  from jsonb_array_elements(p_payments) as split_entries(entry);
  if jsonb_array_length(p_payments) > 0 and payment_total <> target_bill.amount then
    raise exception 'Payments must add up exactly to the order total after loyalty redemption.';
  end if;

  for payment_entry in select value from jsonb_array_elements(p_payments) as entries(value) loop
    entry_amount := (payment_entry->>'amount')::numeric;
    allocated_tip := case when not tip_recorded then p_tip_amount else 0 end;
    if entry_amount > 0 or allocated_tip > 0 then
      perform public.record_restaurant_bill_payment_with_account(
        p_org_id, created_order.id, target_bill.id, entry_amount, allocated_tip,
        payment_entry->>'method', p_created_by,
        case when payment_entry ? 'account_id' then (payment_entry->>'account_id')::uuid else null end
      );
      tip_recorded := true;
    end if;
  end loop;

  if target_bill.amount = 0 then
    update public.restaurant_orders set payment_status = 'paid', updated_at = now()
    where org_id = p_org_id and id = created_order.id
    returning * into created_order;
  end if;

  insert into public.restaurant_pos_order_requests (org_id, request_key, order_id, bill_id)
  values (p_org_id, p_request_key, created_order.id, target_bill.id);

  select coalesce(sum(transaction.points_delta), 0)::integer into earned
  from public.restaurant_loyalty_transactions transaction
  where transaction.org_id = p_org_id and transaction.order_id = created_order.id
    and transaction.transaction_type in ('earn', 'refund_adjustment', 'cancel_adjustment');

  return query select created_order.id, created_order.order_number, target_bill.id,
    created_order.payment_status, earned, p_points_to_redeem, discount_amount;
end;
$$;

revoke all on function public.create_restaurant_order_with_loyalty(
  uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, uuid, uuid, jsonb, numeric, integer, numeric
) from public, anon, authenticated;
grant execute on function public.create_restaurant_order_with_loyalty(
  uuid, uuid, text, uuid, text, text, text, text, jsonb, uuid, uuid, uuid, jsonb, numeric, integer, numeric
) to service_role;

commit;
