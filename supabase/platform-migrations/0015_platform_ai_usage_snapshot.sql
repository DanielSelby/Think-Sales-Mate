create or replace function public.sync_platform_usage_snapshot(p_snapshots jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  snapshot jsonb;
  affected_rows integer := 0;
  v_row_count integer;
  v_organization_id uuid;
  v_snapshot jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can synchronize usage snapshots.';
  end if;
  if p_snapshots is null or jsonb_typeof(p_snapshots) <> 'array' then
    raise exception 'Usage snapshots must be a JSON array.';
  end if;

  for snapshot in select value from jsonb_array_elements(p_snapshots)
  loop
    if jsonb_typeof(snapshot) <> 'object'
      or coalesce(snapshot->>'organization_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(snapshot->>'active_users', '') !~ '^[0-9]+$'
      or coalesce(snapshot->>'branches', '') !~ '^[0-9]+$'
      or coalesce(snapshot->>'products', '') !~ '^[0-9]+$'
      or coalesce(snapshot->>'customers', '') !~ '^[0-9]+$'
      or coalesce(snapshot->>'orders', '') !~ '^[0-9]+$'
      or coalesce(snapshot->>'purchase_count', '') !~ '^[0-9]+$'
      or coalesce(snapshot->>'ai_usage', '') !~ '^[0-9]+$'
      or coalesce(snapshot->>'monthly_activity', '') !~ '^[0-9]+$'
      or coalesce(snapshot->>'sales_volume', '') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      raise exception 'Usage snapshot contains an invalid organization or metric value.';
    end if;

    v_organization_id := (snapshot->>'organization_id')::uuid;
    v_snapshot := snapshot;

    insert into public.platform_usage_metrics (
      organization_id,
      active_users,
      branches,
      products,
      customers,
      orders,
      purchase_count,
      sales_volume,
      ai_usage,
      monthly_activity
    )
    select
      v_organization_id,
      (v_snapshot->>'active_users')::integer,
      (v_snapshot->>'branches')::integer,
      (v_snapshot->>'products')::integer,
      (v_snapshot->>'customers')::integer,
      (v_snapshot->>'orders')::integer,
      (v_snapshot->>'purchase_count')::integer,
      (v_snapshot->>'sales_volume')::numeric,
      (v_snapshot->>'ai_usage')::numeric,
      (v_snapshot->>'monthly_activity')::integer
    where exists (
      select 1
      from public.platform_organizations
      where platform_organizations.organization_id = v_organization_id
    )
    on conflict (organization_id) do update
      set active_users = excluded.active_users,
          branches = excluded.branches,
          products = excluded.products,
          customers = excluded.customers,
          orders = excluded.orders,
          purchase_count = excluded.purchase_count,
          sales_volume = excluded.sales_volume,
          ai_usage = excluded.ai_usage,
          monthly_activity = excluded.monthly_activity,
          updated_at = now();

    get diagnostics v_row_count = row_count;
    affected_rows := affected_rows + v_row_count;
  end loop;

  return affected_rows;
end;
$$;

revoke all on function public.sync_platform_usage_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.sync_platform_usage_snapshot(jsonb) to service_role;
