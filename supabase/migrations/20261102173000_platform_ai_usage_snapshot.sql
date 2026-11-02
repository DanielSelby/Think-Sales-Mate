create or replace function public.get_platform_usage_snapshot(p_since timestamptz)
returns table (
  organization_id uuid,
  active_users integer,
  branches integer,
  products integer,
  customers integer,
  orders bigint,
  purchase_count bigint,
  sales_volume numeric,
  ai_usage bigint,
  monthly_activity bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can read platform usage snapshots.';
  end if;
  if p_since is null then
    raise exception 'A snapshot start time is required.';
  end if;

  return query
  select
    organizations.id,
    (
      select count(distinct members.user_id)::integer
      from public.organization_members as members
      where members.org_id = organizations.id
        and members.status = 'active'
        and members.user_id is not null
    ),
    (
      select count(*)::integer
      from public.business_locations as locations
      where locations.org_id = organizations.id
    ),
    (
      select count(*)::integer
      from public.products as products
      where products.org_id = organizations.id
        and products.is_active
        and products.status = 'active'
    ) + (
      select count(*)::integer
      from public.restaurant_menu_items as menu_items
      where menu_items.org_id = organizations.id
        and menu_items.is_active
    ),
    (
      select count(*)::integer
      from public.customers as customers
      where customers.org_id = organizations.id
    ),
    (
      select count(*)::bigint
      from (
        select sales.id
        from public.sales as sales
        where sales.org_id = organizations.id
          and sales.created_at >= p_since
          and sales.document_status = 'final'
          and sales.status <> 'cancelled'
        union all
        select customer_orders.id
        from public.customer_orders as customer_orders
        where customer_orders.org_id = organizations.id
          and customer_orders.created_at >= p_since
          and customer_orders.status <> 'cancelled'
          and customer_orders.linked_sale_id is null
        union all
        select restaurant_orders.id
        from public.restaurant_orders as restaurant_orders
        where restaurant_orders.org_id = organizations.id
          and restaurant_orders.created_at >= p_since
          and restaurant_orders.status not in ('cancelled', 'pending_payment')
      ) as recent_orders
    ),
    (
      select count(*)::bigint
      from public.purchases as purchases
      where purchases.org_id = organizations.id
        and purchases.created_at >= p_since
        and purchases.status <> 'cancelled'
    ),
    (
      select coalesce(sum(greatest(sales.total - sales.refunded_amount, 0)), 0)
      from public.sales as sales
      where sales.org_id = organizations.id
        and sales.created_at >= p_since
        and sales.document_status = 'final'
        and sales.status <> 'cancelled'
    ) + (
      select coalesce(sum(restaurant_orders.total), 0)
      from public.restaurant_orders as restaurant_orders
      where restaurant_orders.org_id = organizations.id
        and restaurant_orders.created_at >= p_since
        and restaurant_orders.status not in ('cancelled', 'pending_payment')
    ),
    (
      select count(events.id)::bigint
      from public.ai_usage_events as events
      where events.org_id = organizations.id
        and events.created_at >= p_since
    ),
    (
      select count(*)::bigint
      from (
        select sales.id
        from public.sales as sales
        where sales.org_id = organizations.id
          and sales.created_at >= p_since
          and sales.document_status = 'final'
          and sales.status <> 'cancelled'
        union all
        select customer_orders.id
        from public.customer_orders as customer_orders
        where customer_orders.org_id = organizations.id
          and customer_orders.created_at >= p_since
          and customer_orders.status <> 'cancelled'
          and customer_orders.linked_sale_id is null
        union all
        select restaurant_orders.id
        from public.restaurant_orders as restaurant_orders
        where restaurant_orders.org_id = organizations.id
          and restaurant_orders.created_at >= p_since
          and restaurant_orders.status not in ('cancelled', 'pending_payment')
        union all
        select purchases.id
        from public.purchases as purchases
        where purchases.org_id = organizations.id
          and purchases.created_at >= p_since
          and purchases.status <> 'cancelled'
      ) as recent_activity
    )
  from public.organizations as organizations;
end;
$$;

revoke all on function public.get_platform_usage_snapshot(timestamptz) from public, anon, authenticated;
grant execute on function public.get_platform_usage_snapshot(timestamptz) to service_role;
