begin;

create or replace function public.can_access_org_location(
  target_org_id uuid,
  target_location_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        m.branch_scope = 'all'
        or (
          target_location_id is not null
          and (
            m.location_id = target_location_id
            or target_location_id = any(m.secondary_location_ids)
          )
        )
      )
  );
$$;

create or replace function public.can_access_org_locations(
  target_org_id uuid,
  first_location_id uuid,
  second_location_id uuid default null
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_access_org_location(target_org_id, first_location_id)
    and (second_location_id is null or public.can_access_org_location(target_org_id, second_location_id));
$$;

-- These restrictive policies work alongside the existing organization policies.
-- Admin/owner members with branch_scope=all retain organization-wide access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'business_locations',
    'products',
    'product_stock_levels',
    'sales',
    'expenses',
    'purchases',
    'purchase_returns',
    'stock_adjustments',
    'register_closures',
    'held_sales',
    'notifications',
    'customer_orders',
    'communication_channels'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

drop policy if exists "branch scope: business locations" on public.business_locations;
create policy "branch scope: business locations"
  on public.business_locations as restrictive for all
  using (public.can_access_org_location(org_id, id))
  with check (public.can_access_org_location(org_id, id));

-- Some older installations do not have location_id on every organization
-- table (for example invoices). Only create a scoped policy where the
-- referenced column actually exists.
do $$
declare
  table_name text;
  policy_name text;
  using_expression text;
begin
  foreach table_name in array array[
    'products',
    'product_stock_levels',
    'sales',
    'expenses',
    'purchases',
    'purchase_returns',
    'stock_adjustments',
    'register_closures',
    'held_sales',
    'notifications',
    'customer_orders',
    'communication_channels'
  ]
  loop
    if exists (
      select 1
      from information_schema.tables t
      where t.table_schema = 'public' and t.table_name = table_name
    ) and exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = table_name
        and c.column_name = 'location_id'
    ) then
      policy_name := 'branch scope: ' || table_name;
      using_expression := case
        when table_name = 'communication_channels'
          then '(location_id is null or public.can_access_org_location(org_id, location_id))'
        when table_name = 'customer_orders'
          then '(public.can_access_org_location(org_id, location_id) or auth.uid() is null)'
        else 'public.can_access_org_location(org_id, location_id)'
      end;

      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      execute format(
        'create policy %I on public.%I as restrictive for all using (%s) with check (%s)',
        policy_name, table_name, using_expression, using_expression
      );
    end if;
  end loop;
end $$;

commit;
