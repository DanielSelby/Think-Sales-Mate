begin;

drop function if exists public.get_restaurant_financial_summary(uuid, uuid[], timestamptz, timestamptz);

create or replace function public.get_restaurant_financial_summary(
  p_org_id uuid,
  p_location_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can generate restaurant financial summaries.';
  end if;
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at
    or p_end_at - p_start_at > interval '367 days' then
    raise exception 'Choose a valid reporting period of no more than 366 days.';
  end if;

  with selected_locations as (
    select unnest(coalesce(p_location_ids, array[]::uuid[])) as id
  ),
  selected_orders as (
    select orders.id, orders.location_id, orders.total, orders.status
    from public.restaurant_orders orders
    join selected_locations locations on locations.id = orders.location_id
    where orders.org_id = p_org_id
      and orders.created_at >= p_start_at
      and orders.created_at < p_end_at
      and (p_user_id is null or orders.created_by = p_user_id)
  ),
  order_totals as (
    select
      count(*) filter (where status <> 'cancelled') as order_count,
      count(*) filter (where status = 'completed') as completed_order_count,
      count(*) filter (where status = 'cancelled') as cancelled_order_count,
      coalesce(sum(total) filter (where status <> 'cancelled'), 0) as order_sales
    from selected_orders
  ),
  selected_payments as (
    select
      payments.id,
      payments.payment_method,
      payments.payment_type,
      payments.amount,
      payments.tip_amount
    from public.restaurant_order_payments payments
    join public.restaurant_orders orders
      on orders.org_id = payments.org_id and orders.id = payments.order_id
    join selected_locations locations on locations.id = orders.location_id
    where payments.org_id = p_org_id
      and payments.paid_at >= p_start_at
      and payments.paid_at < p_end_at
      and (p_user_id is null or payments.received_by = p_user_id)
  ),
  payment_totals as (
    select
      count(*) as payment_count,
      coalesce(sum(amount) filter (where payment_type = 'payment'), 0) as collected,
      coalesce(sum(amount) filter (where payment_type = 'refund'), 0) as refunded,
      coalesce(sum(tip_amount) filter (where payment_type = 'payment'), 0) as tips,
      coalesce(sum(tip_amount) filter (where payment_type = 'refund'), 0) as refunded_tips,
      coalesce(sum(case when payment_type = 'payment' then amount else -amount end), 0) as net_collected,
      coalesce(sum(case when payment_type = 'payment' then tip_amount else -tip_amount end), 0) as net_tips
    from selected_payments
  ),
  methods as (
    select
      payment_method,
      count(*) filter (where payment_type = 'payment') as payment_count,
      coalesce(sum(amount) filter (where payment_type = 'payment'), 0) as collected,
      coalesce(sum(amount) filter (where payment_type = 'refund'), 0) as refunded,
      coalesce(sum(case when payment_type = 'payment' then amount else -amount end), 0) as net_amount,
      coalesce(sum(case when payment_type = 'payment' then tip_amount else -tip_amount end), 0) as net_tips
    from selected_payments
    group by payment_method
  )
  select jsonb_build_object(
    'order_count', order_totals.order_count,
    'completed_order_count', order_totals.completed_order_count,
    'cancelled_order_count', order_totals.cancelled_order_count,
    'order_sales', order_totals.order_sales,
    'payment_count', payment_totals.payment_count,
    'collected', payment_totals.collected,
    'refunded', payment_totals.refunded,
    'tips', payment_totals.tips,
    'refunded_tips', payment_totals.refunded_tips,
    'net_collected', payment_totals.net_collected,
    'net_tips', payment_totals.net_tips,
    'methods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment_method', methods.payment_method,
        'payment_count', methods.payment_count,
        'collected', methods.collected,
        'refunded', methods.refunded,
        'net_amount', methods.net_amount,
        'net_tips', methods.net_tips
      ) order by methods.payment_method)
      from methods
    ), '[]'::jsonb)
  )
  into result
  from order_totals cross join payment_totals;

  return result;
end;
$$;

revoke all on function public.get_restaurant_financial_summary(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_restaurant_financial_summary(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

commit;
