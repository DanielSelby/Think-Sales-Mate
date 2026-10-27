begin;

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
    select coalesce(sum(payment.amount), 0) as total
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

revoke all on function public.get_restaurant_report(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_restaurant_report(uuid, uuid[], timestamptz, timestamptz) to service_role;

commit;
