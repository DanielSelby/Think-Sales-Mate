begin;

create table if not exists public.restaurant_day_closings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  business_date date not null,
  expected_by_method jsonb not null,
  counted_by_method jsonb not null,
  variance_by_method jsonb not null,
  closed_by uuid not null references auth.users(id),
  closed_at timestamptz not null default now(),
  unique (org_id, location_id, business_date),
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete restrict
);

alter table public.restaurant_day_closings enable row level security;
drop policy if exists "Restaurant day closings: members read assigned locations" on public.restaurant_day_closings;
create policy "Restaurant day closings: members read assigned locations"
  on public.restaurant_day_closings for select
  using (public.is_org_member(org_id) and public.can_access_org_location(org_id, location_id));

create or replace function public.close_restaurant_business_day(
  p_org_id uuid,
  p_location_id uuid,
  p_business_date date,
  p_counted_by_method jsonb,
  p_closed_by uuid
)
returns public.restaurant_day_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  expected jsonb;
  variance jsonb;
  method_name text;
  expected_amount numeric(14,2);
  counted_amount numeric(14,2);
  closing_row public.restaurant_day_closings;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can close a Restaurant business day.';
  end if;
  if p_business_date is null or p_business_date > current_date then
    raise exception 'Choose a valid business date that is not in the future.';
  end if;
  if coalesce(jsonb_typeof(p_counted_by_method), '') <> 'object' then
    raise exception 'Provide counted totals by payment method.';
  end if;
  if not exists (
    select 1 from public.business_locations
    where org_id = p_org_id and id = p_location_id and is_active
  ) then
    raise exception 'Restaurant branch not found or inactive.';
  end if;
  if exists (
    select 1 from jsonb_each(p_counted_by_method) counted
    where counted.key not in ('cash', 'card', 'mobile_money', 'other')
      or case when jsonb_typeof(counted.value) = 'number'
        then (counted.value::text)::numeric < 0
          or abs((counted.value::text)::numeric * 100 - round((counted.value::text)::numeric * 100)) > 0.000001
        else true
      end
  ) then
    raise exception 'Counted tender totals must be non-negative amounts with at most two decimal places.';
  end if;
  select coalesce(jsonb_object_agg(method, amount), '{}'::jsonb) into expected
  from (
    select payment.payment_method as method,
      sum(case when payment.payment_type = 'refund'
        then -(payment.amount + payment.tip_amount)
        else payment.amount + payment.tip_amount
      end)::numeric(14,2) as amount
    from public.restaurant_order_payments payment
    join public.restaurant_orders restaurant_order
      on restaurant_order.org_id = payment.org_id and restaurant_order.id = payment.order_id
    where payment.org_id = p_org_id and restaurant_order.location_id = p_location_id
      and (payment.paid_at at time zone 'UTC')::date = p_business_date
    group by payment.payment_method
  ) tender_totals;

  variance := '{}'::jsonb;
  foreach method_name in array array['cash', 'card', 'mobile_money', 'other']
  loop
    expected_amount := coalesce((expected->>method_name)::numeric, 0);
    counted_amount := coalesce((p_counted_by_method->>method_name)::numeric, 0);
    variance := variance || jsonb_build_object(method_name, round(counted_amount - expected_amount, 2));
  end loop;
  insert into public.restaurant_day_closings (
    org_id, location_id, business_date, expected_by_method,
    counted_by_method, variance_by_method, closed_by
  ) values (
    p_org_id, p_location_id, p_business_date, expected,
    p_counted_by_method, variance, p_closed_by
  ) returning * into closing_row;
  return closing_row;
end;
$$;

revoke all on function public.close_restaurant_business_day(uuid, uuid, date, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.close_restaurant_business_day(uuid, uuid, date, jsonb, uuid) to service_role;

create or replace function public.get_restaurant_item_margins(
  p_org_id uuid,
  p_location_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (
  menu_item_id uuid,
  item_name text,
  item_type text,
  quantity_sold numeric,
  sales numeric,
  estimated_unit_cost numeric,
  estimated_cost numeric,
  gross_profit numeric,
  margin_percent numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with item_sales as (
    select order_item.menu_item_id,
      order_item.item_name,
      sum(order_item.quantity)::numeric(14,3) as quantity_sold,
      sum(order_item.line_total)::numeric(14,2) as sales
    from public.restaurant_order_items order_item
    join public.restaurant_orders restaurant_order
      on restaurant_order.org_id = order_item.org_id and restaurant_order.id = order_item.order_id
    where order_item.org_id = p_org_id
      and restaurant_order.location_id = any(coalesce(p_location_ids, '{}'::uuid[]))
      and restaurant_order.created_at >= p_start_at and restaurant_order.created_at < p_end_at
      and restaurant_order.status <> 'cancelled'
      and order_item.kitchen_status <> 'cancelled'
    group by order_item.menu_item_id, order_item.item_name
  ),
  unit_costs as (
    select menu_item.id as menu_item_id,
      menu_item.name,
      menu_item.item_type,
      case when menu_item.item_type = 'packaged' then
        coalesce((
          select sum(purchase_line.quantity_received * purchase_line.unit_cost)
            / nullif(sum(purchase_line.quantity_received), 0)
          from public.restaurant_packaged_purchase_items purchase_line
          join public.restaurant_packaged_purchase_orders purchase
            on purchase.org_id = purchase_line.org_id and purchase.id = purchase_line.purchase_order_id
          where purchase_line.org_id = p_org_id
            and purchase_line.menu_item_id = menu_item.id
            and purchase.location_id = any(coalesce(p_location_ids, '{}'::uuid[]))
        ), 0)
      else coalesce((
        select sum(recipe.quantity * ingredient.cost_per_unit)
        from public.restaurant_recipe_ingredients recipe
        join public.restaurant_ingredients ingredient
          on ingredient.org_id = recipe.org_id and ingredient.id = recipe.ingredient_id
        where recipe.org_id = p_org_id and recipe.menu_item_id = menu_item.id
      ), 0) end::numeric(14,4) as unit_cost
    from public.restaurant_menu_items menu_item
    where menu_item.org_id = p_org_id
  )
  select sales.menu_item_id, sales.item_name, cost.item_type, sales.quantity_sold,
    sales.sales, coalesce(cost.unit_cost, 0),
    (sales.quantity_sold * coalesce(cost.unit_cost, 0))::numeric(14,2) as estimated_cost,
    (sales.sales - sales.quantity_sold * coalesce(cost.unit_cost, 0))::numeric(14,2) as gross_profit,
    case when sales.sales > 0
      then ((sales.sales - sales.quantity_sold * coalesce(cost.unit_cost, 0)) / sales.sales * 100)::numeric(8,2)
      else 0::numeric
    end as margin_percent
  from item_sales sales
  left join unit_costs cost on cost.menu_item_id = sales.menu_item_id
  order by gross_profit desc, sales.sales desc;
$$;

revoke all on function public.get_restaurant_item_margins(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_restaurant_item_margins(uuid, uuid[], timestamptz, timestamptz) to service_role;

commit;
