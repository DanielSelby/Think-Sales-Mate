begin;

create table if not exists public.restaurant_bills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  split_type text not null default 'single' check (split_type in ('single', 'items', 'equal')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, order_id)
    references public.restaurant_orders(org_id, id) on delete cascade
);

create table if not exists public.restaurant_bill_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bill_id uuid not null,
  order_item_id uuid not null,
  quantity numeric(10,2) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (org_id, bill_id, order_item_id),
  foreign key (org_id, bill_id)
    references public.restaurant_bills(org_id, id) on delete cascade,
  foreign key (org_id, order_item_id)
    references public.restaurant_order_items(org_id, id) on delete cascade
);

alter table public.restaurant_order_payments
  add column if not exists bill_id uuid,
  add column if not exists payment_type text not null default 'payment',
  add column if not exists tip_amount numeric(12,2) not null default 0,
  add column if not exists refund_of_payment_id uuid;

alter table public.restaurant_order_payments
  drop constraint if exists restaurant_order_payments_amount_check;
alter table public.restaurant_order_payments
  add constraint restaurant_order_payments_amount_check check (amount >= 0);
alter table public.restaurant_order_payments
  drop constraint if exists restaurant_order_payments_payment_type_check;
alter table public.restaurant_order_payments
  add constraint restaurant_order_payments_payment_type_check
    check (payment_type in ('payment', 'refund'));
alter table public.restaurant_order_payments
  drop constraint if exists restaurant_order_payments_tip_amount_check;
alter table public.restaurant_order_payments
  add constraint restaurant_order_payments_tip_amount_check check (tip_amount >= 0);
alter table public.restaurant_order_payments
  drop constraint if exists restaurant_order_payments_refund_link_check;
alter table public.restaurant_order_payments
  add constraint restaurant_order_payments_refund_link_check
    check ((payment_type = 'payment' and refund_of_payment_id is null)
      or (payment_type = 'refund' and refund_of_payment_id is not null));
alter table public.restaurant_order_payments
  drop constraint if exists restaurant_order_payments_payment_value_check;
alter table public.restaurant_order_payments
  add constraint restaurant_order_payments_payment_value_check
    check (amount + tip_amount > 0);
alter table public.restaurant_order_payments
  drop constraint if exists restaurant_order_payments_bill_fk;
alter table public.restaurant_order_payments
  add constraint restaurant_order_payments_bill_fk
    foreign key (org_id, bill_id) references public.restaurant_bills(org_id, id);
alter table public.restaurant_order_payments
  drop constraint if exists restaurant_order_payments_refund_fk;
alter table public.restaurant_order_payments
  add constraint restaurant_order_payments_refund_fk
    foreign key (refund_of_payment_id) references public.restaurant_order_payments(id) on delete restrict;

insert into public.restaurant_bills (org_id, order_id, name, split_type, amount)
select orders.org_id, orders.id, 'Full bill', 'single', orders.total
from public.restaurant_orders orders
where not exists (
  select 1 from public.restaurant_bills bills
  where bills.org_id = orders.org_id and bills.order_id = orders.id
);

insert into public.restaurant_bill_items (org_id, bill_id, order_item_id, quantity)
select item.org_id, bill.id, item.id, item.quantity
from public.restaurant_order_items item
join public.restaurant_bills bill
  on bill.org_id = item.org_id and bill.order_id = item.order_id
  and bill.split_type = 'single'
where not exists (
  select 1 from public.restaurant_bill_items allocation
  where allocation.org_id = item.org_id and allocation.bill_id = bill.id
    and allocation.order_item_id = item.id
);

update public.restaurant_order_payments payment
set bill_id = bill.id
from public.restaurant_bills bill
where payment.bill_id is null
  and bill.org_id = payment.org_id
  and bill.order_id = payment.order_id
  and bill.split_type = 'single';

alter table public.restaurant_order_payments
  alter column bill_id set not null;

create index if not exists restaurant_bills_org_order_idx
  on public.restaurant_bills(org_id, order_id, created_at);
create index if not exists restaurant_bill_items_org_bill_idx
  on public.restaurant_bill_items(org_id, bill_id);
create index if not exists restaurant_order_payments_bill_idx
  on public.restaurant_order_payments(org_id, bill_id, paid_at desc);
create index if not exists restaurant_order_payments_refund_idx
  on public.restaurant_order_payments(refund_of_payment_id)
  where payment_type = 'refund';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_bills') then
      alter publication supabase_realtime add table public.restaurant_bills;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_bill_items') then
      alter publication supabase_realtime add table public.restaurant_bill_items;
    end if;
  end if;
end
$$;

alter table public.restaurant_bills enable row level security;
alter table public.restaurant_bill_items enable row level security;

drop policy if exists "Restaurant bills: members read authorized orders" on public.restaurant_bills;
create policy "Restaurant bills: members read authorized orders"
  on public.restaurant_bills for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1 from public.restaurant_orders orders
      where orders.org_id = restaurant_bills.org_id
        and orders.id = restaurant_bills.order_id
        and public.can_access_org_location(orders.org_id, orders.location_id)
    )
  );
drop policy if exists "Restaurant bill items: members read authorized orders" on public.restaurant_bill_items;
create policy "Restaurant bill items: members read authorized orders"
  on public.restaurant_bill_items for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1
      from public.restaurant_bills bill
      join public.restaurant_orders orders
        on orders.org_id = bill.org_id and orders.id = bill.order_id
      where bill.org_id = restaurant_bill_items.org_id
        and bill.id = restaurant_bill_items.bill_id
        and public.can_access_org_location(orders.org_id, orders.location_id)
    )
  );

create or replace function public.initialize_restaurant_bill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.restaurant_bills (org_id, order_id, name, split_type, amount)
  values (new.org_id, new.id, 'Full bill', 'single', new.total);
  return new;
end;
$$;

create or replace function public.allocate_restaurant_order_item_to_bill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_bill public.restaurant_bills;
begin
  select * into target_bill
  from public.restaurant_bills
  where org_id = new.org_id and order_id = new.order_id
  order by created_at, id
  limit 1;
  if not found or target_bill.split_type <> 'single' then
    raise exception 'A new order item cannot be added after the bill has been split.';
  end if;
  insert into public.restaurant_bill_items (org_id, bill_id, order_item_id, quantity)
  values (new.org_id, target_bill.id, new.id, new.quantity);
  return new;
end;
$$;

create or replace function public.sync_restaurant_single_bill_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.restaurant_bills
  set amount = new.total, updated_at = now()
  where org_id = new.org_id and order_id = new.id
    and split_type = 'single'
    and (select count(*) from public.restaurant_bills
         where org_id = new.org_id and order_id = new.id) = 1
    and not exists (
      select 1 from public.restaurant_order_payments
      where org_id = new.org_id and order_id = new.id
    );
  return new;
end;
$$;

drop trigger if exists restaurant_orders_create_bill on public.restaurant_orders;
create trigger restaurant_orders_create_bill
  after insert on public.restaurant_orders
  for each row execute function public.initialize_restaurant_bill();
drop trigger if exists restaurant_orders_sync_single_bill on public.restaurant_orders;
create trigger restaurant_orders_sync_single_bill
  after update of total on public.restaurant_orders
  for each row when (old.total is distinct from new.total)
  execute function public.sync_restaurant_single_bill_amount();
drop trigger if exists restaurant_order_items_allocate_bill on public.restaurant_order_items;
create trigger restaurant_order_items_allocate_bill
  after insert on public.restaurant_order_items
  for each row execute function public.allocate_restaurant_order_item_to_bill();

create or replace function public.split_restaurant_bill_by_items(
  p_org_id uuid,
  p_order_id uuid,
  p_bills jsonb
)
returns setof public.restaurant_bills
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.restaurant_orders;
  current_bill public.restaurant_bills;
  bill_spec record;
  line_spec jsonb;
  target_item public.restaurant_order_items;
  created_bill public.restaurant_bills;
  bill_position integer := 0;
  bill_amount numeric(12,2);
  item_count integer;
  allocation_quantity numeric(10,2);
  quantity_allocated numeric(10,2);
  total_allocated numeric(12,2) := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can split restaurant bills.';
  end if;
  if coalesce(jsonb_typeof(p_bills), '') <> 'array' then
    raise exception 'Create between 2 and 20 guest checks.';
  end if;
  if jsonb_array_length(p_bills) < 2 or jsonb_array_length(p_bills) > 20 then
    raise exception 'Create between 2 and 20 guest checks.';
  end if;
  select * into target_order
  from public.restaurant_orders
  where org_id = p_org_id and id = p_order_id
  for update;
  if not found or target_order.status = 'cancelled' then
    raise exception 'Restaurant order not found or cancelled.';
  end if;
  if target_order.total <= 0 then
    raise exception 'A zero-value order cannot be split into guest checks.';
  end if;
  if exists (select 1 from public.restaurant_order_payments where org_id = p_org_id and order_id = p_order_id) then
    raise exception 'A bill cannot be split after a payment or refund has been recorded.';
  end if;
  select * into current_bill
  from public.restaurant_bills
  where org_id = p_org_id and order_id = p_order_id
  order by created_at, id
  limit 1
  for update;
  if not found or current_bill.split_type <> 'single'
    or (select count(*) from public.restaurant_bills where org_id = p_org_id and order_id = p_order_id) <> 1 then
    raise exception 'This order has already been split.';
  end if;

  delete from public.restaurant_bill_items
  where org_id = p_org_id and bill_id = current_bill.id;
  for bill_spec in
    select value, ordinality from jsonb_array_elements(p_bills) with ordinality
  loop
    bill_position := bill_position + 1;
    if jsonb_typeof(bill_spec.value) <> 'object'
      or length(btrim(coalesce(bill_spec.value->>'name', ''))) not between 1 and 80
      or jsonb_typeof(bill_spec.value->'items') <> 'array' then
      raise exception 'Each guest check must have a name and item assignments.';
    end if;
    if bill_position = 1 then
      update public.restaurant_bills
      set name = btrim(bill_spec.value->>'name'), split_type = 'items', amount = 0, updated_at = now()
      where id = current_bill.id
      returning * into created_bill;
    else
      insert into public.restaurant_bills (org_id, order_id, name, split_type, amount)
      values (p_org_id, p_order_id, btrim(bill_spec.value->>'name'), 'items', 0)
      returning * into created_bill;
    end if;
    bill_amount := 0;
    item_count := 0;
    for line_spec in select value from jsonb_array_elements(bill_spec.value->'items')
    loop
      if jsonb_typeof(line_spec) <> 'object'
        or coalesce(line_spec->>'order_item_id', '') = ''
        or coalesce(line_spec->>'quantity', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
        raise exception 'Each item assignment must contain a valid item and quantity.';
      end if;
      allocation_quantity := (line_spec->>'quantity')::numeric;
      if allocation_quantity <= 0 then
        raise exception 'Assigned item quantities must be greater than zero.';
      end if;
      select * into target_item
      from public.restaurant_order_items
      where org_id = p_org_id and order_id = p_order_id
        and id = (line_spec->>'order_item_id')::uuid;
      if not found then
        raise exception 'An assigned item does not belong to this order.';
      end if;
      insert into public.restaurant_bill_items (org_id, bill_id, order_item_id, quantity)
      values (p_org_id, created_bill.id, target_item.id, allocation_quantity);
      bill_amount := bill_amount + round(target_item.unit_price * allocation_quantity, 2);
      item_count := item_count + 1;
    end loop;
    if item_count = 0 then
      raise exception 'Each guest check must contain at least one item.';
    end if;
    update public.restaurant_bills
    set amount = bill_amount, updated_at = now()
    where id = created_bill.id
    returning * into created_bill;
    total_allocated := total_allocated + bill_amount;
    return next created_bill;
  end loop;

  for target_item in
    select * from public.restaurant_order_items
    where org_id = p_org_id and order_id = p_order_id
  loop
    select coalesce(sum(allocation.quantity), 0) into quantity_allocated
    from public.restaurant_bill_items allocation
    join public.restaurant_bills bill
      on bill.org_id = allocation.org_id and bill.id = allocation.bill_id
    where allocation.org_id = p_org_id and allocation.order_item_id = target_item.id
      and bill.order_id = p_order_id;
    if quantity_allocated <> target_item.quantity then
      raise exception 'Assigned quantities for "%" must add up to %.',
        target_item.item_name, target_item.quantity;
    end if;
  end loop;
  if total_allocated <> target_order.total then
    raise exception 'Guest check totals do not match the order total.';
  end if;
end;
$$;

create or replace function public.split_restaurant_bill_equally(
  p_org_id uuid,
  p_order_id uuid,
  p_share_count integer
)
returns setof public.restaurant_bills
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.restaurant_orders;
  current_bill public.restaurant_bills;
  created_bill public.restaurant_bills;
  share_index integer;
  share_amount numeric(12,2);
  assigned_amount numeric(12,2) := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can split restaurant bills.';
  end if;
  if p_share_count < 2 or p_share_count > 20 then
    raise exception 'Create between 2 and 20 equal shares.';
  end if;
  select * into target_order
  from public.restaurant_orders
  where org_id = p_org_id and id = p_order_id
  for update;
  if not found or target_order.status = 'cancelled' then
    raise exception 'Restaurant order not found or cancelled.';
  end if;
  if target_order.total <= 0 then
    raise exception 'A zero-value order cannot be split into equal shares.';
  end if;
  if exists (select 1 from public.restaurant_order_payments where org_id = p_org_id and order_id = p_order_id) then
    raise exception 'A bill cannot be split after a payment or refund has been recorded.';
  end if;
  select * into current_bill
  from public.restaurant_bills
  where org_id = p_org_id and order_id = p_order_id
  order by created_at, id
  limit 1
  for update;
  if not found or current_bill.split_type <> 'single'
    or (select count(*) from public.restaurant_bills where org_id = p_org_id and order_id = p_order_id) <> 1 then
    raise exception 'This order has already been split.';
  end if;
  delete from public.restaurant_bill_items
  where org_id = p_org_id and bill_id = current_bill.id;

  for share_index in 1..p_share_count loop
    if share_index = p_share_count then
      share_amount := target_order.total - assigned_amount;
    else
      share_amount := round(target_order.total / p_share_count, 2);
      assigned_amount := assigned_amount + share_amount;
    end if;
    if share_index = 1 then
      update public.restaurant_bills
      set name = 'Guest 1', split_type = 'equal', amount = share_amount, updated_at = now()
      where id = current_bill.id
      returning * into created_bill;
    else
      insert into public.restaurant_bills (org_id, order_id, name, split_type, amount)
      values (p_org_id, p_order_id, 'Guest ' || share_index, 'equal', share_amount)
      returning * into created_bill;
    end if;
    return next created_bill;
  end loop;
end;
$$;

create or replace function public.record_restaurant_bill_payment(
  p_org_id uuid,
  p_order_id uuid,
  p_bill_id uuid,
  p_amount numeric,
  p_tip_amount numeric,
  p_payment_method text,
  p_received_by uuid
)
returns public.restaurant_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.restaurant_orders;
  target_bill public.restaurant_bills;
  paid_total numeric(12,2);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can record restaurant payments.';
  end if;
  if p_amount < 0 or p_tip_amount < 0 or p_amount <> round(p_amount, 2)
    or p_tip_amount <> round(p_tip_amount, 2) or p_amount + p_tip_amount <= 0
    or p_payment_method not in ('cash', 'card', 'mobile_money', 'other') then
    raise exception 'Enter a valid payment amount, tip, and method.';
  end if;
  select * into target_order from public.restaurant_orders
  where org_id = p_org_id and id = p_order_id for update;
  if not found or target_order.status = 'cancelled' then
    raise exception 'Restaurant order not found or cancelled.';
  end if;
  select * into target_bill from public.restaurant_bills
  where org_id = p_org_id and order_id = p_order_id and id = p_bill_id for update;
  if not found then raise exception 'Restaurant bill not found for this order.'; end if;

  select coalesce(sum(case when payment_type = 'payment' then amount else -amount end), 0)
  into paid_total
  from public.restaurant_order_payments
  where org_id = p_org_id and bill_id = p_bill_id;
  if p_amount > target_bill.amount - paid_total then
    raise exception 'Payment exceeds the outstanding guest check balance.';
  end if;
  insert into public.restaurant_order_payments (
    org_id, order_id, bill_id, amount, tip_amount, payment_type, payment_method, received_by
  ) values (p_org_id, p_order_id, p_bill_id, p_amount, p_tip_amount, 'payment', p_payment_method, p_received_by);

  select coalesce(sum(case when payment_type = 'payment' then amount else -amount end), 0)
  into paid_total
  from public.restaurant_order_payments
  where org_id = p_org_id and order_id = p_order_id;
  update public.restaurant_orders
  set payment_status = case
        when paid_total >= total then 'paid'
        when paid_total > 0 then 'partial'
        else 'unpaid'
      end,
      updated_at = now()
  where id = p_order_id
  returning * into target_order;
  return target_order;
end;
$$;

create or replace function public.refund_restaurant_payment(
  p_org_id uuid,
  p_order_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_tip_amount numeric,
  p_payment_method text,
  p_received_by uuid
)
returns public.restaurant_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.restaurant_orders;
  target_payment public.restaurant_order_payments;
  refunded_amount numeric(12,2);
  refunded_tip numeric(12,2);
  paid_total numeric(12,2);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can refund restaurant payments.';
  end if;
  if p_amount < 0 or p_tip_amount < 0 or p_amount <> round(p_amount, 2)
    or p_tip_amount <> round(p_tip_amount, 2) or p_amount + p_tip_amount <= 0
    or p_payment_method not in ('cash', 'card', 'mobile_money', 'other') then
    raise exception 'Enter a valid refund amount, tip refund, and method.';
  end if;
  select * into target_order from public.restaurant_orders
  where org_id = p_org_id and id = p_order_id for update;
  if not found then raise exception 'Restaurant order not found.'; end if;
  select * into target_payment from public.restaurant_order_payments
  where org_id = p_org_id and order_id = p_order_id
    and id = p_payment_id and payment_type = 'payment'
  for update;
  if not found then raise exception 'Original restaurant payment not found.'; end if;
  select coalesce(sum(amount), 0), coalesce(sum(tip_amount), 0)
  into refunded_amount, refunded_tip
  from public.restaurant_order_payments
  where org_id = p_org_id and refund_of_payment_id = p_payment_id;
  if p_amount > target_payment.amount - refunded_amount
    or p_tip_amount > target_payment.tip_amount - refunded_tip then
    raise exception 'Refund exceeds the unrefunded amount of this payment.';
  end if;
  insert into public.restaurant_order_payments (
    org_id, order_id, bill_id, amount, tip_amount, payment_type, refund_of_payment_id,
    payment_method, received_by
  ) values (
    p_org_id, p_order_id, target_payment.bill_id, p_amount, p_tip_amount, 'refund',
    p_payment_id, p_payment_method, p_received_by
  );
  select coalesce(sum(case when payment_type = 'payment' then amount else -amount end), 0)
  into paid_total
  from public.restaurant_order_payments
  where org_id = p_org_id and order_id = p_order_id;
  update public.restaurant_orders
  set payment_status = case
        when paid_total >= total then 'paid'
        when paid_total > 0 then 'partial'
        else 'unpaid'
      end,
      updated_at = now()
  where id = p_order_id
  returning * into target_order;
  return target_order;
end;
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
      'daily', '[]'::jsonb, 'by_type', '[]'::jsonb, 'top_items', '[]'::jsonb
    );
  end if;

  with filtered_orders as (
    select id, location_id, order_type, status, total, created_at
    from public.restaurant_orders
    where org_id = p_org_id and location_id = any(p_location_ids)
      and created_at >= p_start_at and created_at < p_end_at
  ),
  summary as (
    select count(*) filter (where status <> 'cancelled') as order_count,
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
    select (created_at at time zone 'UTC')::date as report_date,
      count(*) filter (where status <> 'cancelled') as order_count,
      coalesce(sum(total) filter (where status <> 'cancelled'), 0) as gross_sales
    from filtered_orders group by (created_at at time zone 'UTC')::date
  ),
  service_types as (
    select order_type, count(*) filter (where status <> 'cancelled') as order_count,
      coalesce(sum(total) filter (where status <> 'cancelled'), 0) as gross_sales
    from filtered_orders group by order_type
  ),
  item_sales as (
    select order_item.item_name, coalesce(sum(order_item.quantity), 0) as quantity_sold,
      coalesce(sum(order_item.line_total), 0) as sales
    from public.restaurant_order_items order_item
    join filtered_orders order_row on order_row.id = order_item.order_id
    where order_item.org_id = p_org_id and order_row.status <> 'cancelled'
    group by order_item.item_name
    order by sum(order_item.line_total) desc, sum(order_item.quantity) desc
    limit 10
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'order_count', summary.order_count, 'completed_count', summary.completed_count,
      'cancelled_count', summary.cancelled_count, 'gross_sales', summary.gross_sales,
      'collected_payments', paid.total, 'average_order', summary.average_order
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', daily.report_date, 'order_count', daily.order_count, 'gross_sales', daily.gross_sales
    ) order by daily.report_date) from daily), '[]'::jsonb),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object(
      'order_type', service_types.order_type, 'order_count', service_types.order_count, 'gross_sales', service_types.gross_sales
    ) order by service_types.order_type) from service_types), '[]'::jsonb),
    'top_items', coalesce((select jsonb_agg(jsonb_build_object(
      'item_name', item_sales.item_name, 'quantity_sold', item_sales.quantity_sold, 'sales', item_sales.sales
    ) order by item_sales.sales desc) from item_sales), '[]'::jsonb)
  )
  into report from summary cross join paid;
  return report;
end;
$$;

revoke all on function public.initialize_restaurant_bill() from public, anon, authenticated;
revoke all on function public.allocate_restaurant_order_item_to_bill() from public, anon, authenticated;
revoke all on function public.sync_restaurant_single_bill_amount() from public, anon, authenticated;
revoke all on function public.split_restaurant_bill_by_items(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.split_restaurant_bill_equally(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.record_restaurant_bill_payment(uuid, uuid, uuid, numeric, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.refund_restaurant_payment(uuid, uuid, uuid, numeric, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.get_restaurant_report(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.record_restaurant_payment(uuid, uuid, numeric, text, uuid) from service_role;
grant execute on function public.split_restaurant_bill_by_items(uuid, uuid, jsonb) to service_role;
grant execute on function public.split_restaurant_bill_equally(uuid, uuid, integer) to service_role;
grant execute on function public.record_restaurant_bill_payment(uuid, uuid, uuid, numeric, numeric, text, uuid) to service_role;
grant execute on function public.refund_restaurant_payment(uuid, uuid, uuid, numeric, numeric, text, uuid) to service_role;
grant execute on function public.get_restaurant_report(uuid, uuid[], timestamptz, timestamptz) to service_role;

commit;
