begin;

create or replace function public.education_can_access_tab_branch(
  target_org_id uuid,
  target_branch_id uuid,
  target_module text,
  target_page text,
  target_tab text,
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with effective_permissions as (
    select
      member.role,
      case
        when product_permission.permissions_mode = 'custom'
          then product_permission.permissions
        when product_template.org_id is not null
          then product_template.permissions
        when organization_template.org_id is not null
          then organization_template.permissions
        else coalesce(member.access_permissions -> 'role_defaults_fallback', '{}'::jsonb)
      end as permissions
    from public.organization_members member
    left join public.organization_member_product_permissions product_permission
      on product_permission.org_id = member.org_id
      and product_permission.user_id = member.user_id
      and product_permission.product_slug = 'think-education'
    left join public.organization_product_role_templates product_template
      on product_template.org_id = member.org_id
      and product_template.product_slug = 'think-education'
      and product_template.role_key = coalesce(
        product_permission.role_key,
        member.access_permissions ->> 'role_key',
        member.role::text
      )
    left join public.organization_role_templates organization_template
      on organization_template.org_id = member.org_id
      and organization_template.role_key = coalesce(
        product_permission.role_key,
        member.access_permissions ->> 'role_key',
        member.role::text
      )
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and target_module = 'education_transport'
  )
  select public.education_user_has_branch_scope(target_org_id, target_branch_id)
    and public.has_product_access(
      target_org_id,
      'think-education',
      target_action <> 'view'
    )
    and exists (
      select 1
      from effective_permissions permission
      where (
        permission.role = 'owner'
        or public.is_org_product_admin(target_org_id)
        or exists (
          select 1
          from public.organization_product_access_assignments assignment
          where assignment.org_id = target_org_id
            and assignment.user_id = auth.uid()
            and assignment.product_slug = 'think-education'
            and assignment.is_active
        )
      )
      and (
        permission.role = 'owner'
        or public.is_org_product_admin(target_org_id)
        or case
          when permission.permissions ? (target_module || '.' || target_page || '.' || target_tab)
            then coalesce(
              permission.permissions -> (target_module || '.' || target_page || '.' || target_tab),
              '[]'::jsonb
            ) ? target_action
          else coalesce(permission.permissions -> target_module, '[]'::jsonb) ? target_action
        end
      )
    );
$$;

revoke all on function public.education_can_access_tab_branch(
  uuid, uuid, text, text, text, text
) from public, anon;
grant execute on function public.education_can_access_tab_branch(
  uuid, uuid, text, text, text, text
) to authenticated;

drop policy if exists "education transport vehicles read" on public.education_transport_vehicles;
create policy "education transport vehicles read"
  on public.education_transport_vehicles for select
  using (
    public.education_can_access_tab_branch(
      org_id, branch_id, 'education_transport', 'transport', 'fleet', 'view'
    )
  );

drop policy if exists "education transport routes read" on public.education_transport_routes;
create policy "education transport routes read"
  on public.education_transport_routes for select
  using (
    public.education_can_access_tab_branch(
      org_id, branch_id, 'education_transport', 'transport', 'fleet', 'view'
    )
    or public.education_can_access_tab_branch(
      org_id, branch_id, 'education_transport', 'transport', 'assignments', 'view'
    )
  );

drop policy if exists "education transport assignments read" on public.education_transport_assignments;
create policy "education transport assignments read"
  on public.education_transport_assignments for select
  using (
    public.education_can_access_tab_branch(
      org_id, branch_id, 'education_transport', 'transport', 'assignments', 'view'
    )
  );

create or replace function public.education_enforce_transport_tab_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  target_branch_id uuid;
  target_tab text;
  required_action text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Transport records must be changed through their authorized workflow.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    target_org_id := new.org_id;
    target_branch_id := new.branch_id;
    required_action := 'create';
  else
    if new.org_id is distinct from old.org_id
      or new.branch_id is distinct from old.branch_id then
      raise exception 'Transport records cannot be moved between organizations or campuses.'
        using errcode = '42501';
    end if;
    target_org_id := old.org_id;
    target_branch_id := old.branch_id;
    required_action := 'edit';
  end if;

  target_tab := case tg_table_name
    when 'education_transport_vehicles' then 'fleet'
    when 'education_transport_routes' then 'fleet'
    when 'education_transport_assignments' then 'assignments'
    else null
  end;
  if target_tab is null
    or not public.education_can_access_tab_branch(
      target_org_id,
      target_branch_id,
      'education_transport',
      'transport',
      target_tab,
      required_action
    ) then
    raise exception 'You do not have permission to change this transport record.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.education_enforce_transport_tab_permission()
  from public, anon, authenticated;

drop trigger if exists education_transport_vehicle_tab_permission_guard
  on public.education_transport_vehicles;
create trigger education_transport_vehicle_tab_permission_guard
  before insert or update or delete on public.education_transport_vehicles
  for each row execute function public.education_enforce_transport_tab_permission();

drop trigger if exists education_transport_route_tab_permission_guard
  on public.education_transport_routes;
create trigger education_transport_route_tab_permission_guard
  before insert or update or delete on public.education_transport_routes
  for each row execute function public.education_enforce_transport_tab_permission();

drop trigger if exists education_transport_assignment_tab_permission_guard
  on public.education_transport_assignments;
create trigger education_transport_assignment_tab_permission_guard
  before insert or update or delete on public.education_transport_assignments
  for each row execute function public.education_enforce_transport_tab_permission();

create or replace function public.education_get_transport_dashboard_summary(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_route_ids uuid[]
) returns table (
  route_id uuid,
  active_assignment_count bigint,
  active_route_count bigint,
  assigned_students bigint,
  total_capacity bigint,
  highest_route_name text,
  highest_utilization numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with scoped_routes as (
    select
      route.id,
      route.branch_id,
      route.name,
      route.status as route_status,
      vehicle.status as vehicle_status,
      vehicle.capacity,
      public.education_can_access_tab_branch(
        p_org_id, route.branch_id, 'education_transport', 'transport', 'fleet', 'view'
      ) as can_view_fleet,
      public.education_can_access_tab_branch(
        p_org_id, route.branch_id, 'education_transport', 'transport', 'assignments', 'view'
      ) as can_view_assignments
    from public.education_transport_routes route
    left join public.education_transport_vehicles vehicle
      on vehicle.org_id = route.org_id
      and vehicle.branch_id = route.branch_id
      and vehicle.id = route.vehicle_id
    where route.org_id = p_org_id
      and route.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and (
        public.education_can_access_tab_branch(
          p_org_id, route.branch_id, 'education_transport', 'transport', 'fleet', 'view'
        )
        or public.education_can_access_tab_branch(
          p_org_id, route.branch_id, 'education_transport', 'transport', 'assignments', 'view'
        )
      )
  ),
  assignment_counts as (
    select assignment.route_id, count(*)::bigint as active_assignment_count
    from public.education_transport_assignments assignment
    join scoped_routes route
      on route.id = assignment.route_id
      and route.can_view_assignments
    where assignment.org_id = p_org_id
      and assignment.status = 'active'
    group by assignment.route_id
  ),
  route_summaries as (
    select
      route.id,
      route.branch_id,
      route.name,
      route.route_status,
      route.vehicle_status,
      route.capacity,
      route.can_view_fleet,
      route.can_view_assignments,
      coalesce(assignment_counts.active_assignment_count, 0)::bigint as active_assignment_count,
      case
        when route.can_view_fleet and route.can_view_assignments and route.capacity > 0 then
          round((coalesce(assignment_counts.active_assignment_count, 0)::numeric / route.capacity) * 1000) / 10
        else 0
      end as utilization_percentage
    from scoped_routes route
    left join assignment_counts on assignment_counts.route_id = route.id
  ),
  metrics as (
    select
      count(*) filter (
        where can_view_fleet and route_status = 'active' and vehicle_status = 'active'
      )::bigint as active_route_count,
      coalesce(sum(active_assignment_count) filter (where can_view_assignments), 0)::bigint as assigned_students,
      coalesce(sum(capacity) filter (where can_view_fleet), 0)::bigint as total_capacity
    from route_summaries
  ),
  highest_route as (
    select name, utilization_percentage
    from route_summaries
    where can_view_fleet and can_view_assignments
    order by utilization_percentage desc, branch_id, name, id
    limit 1
  ),
  selected_routes as (
    select id, active_assignment_count
    from route_summaries
    where id = any(coalesce(p_route_ids, '{}'::uuid[]))
  )
  select
    selected_routes.id,
    coalesce(selected_routes.active_assignment_count, 0)::bigint,
    metrics.active_route_count,
    metrics.assigned_students,
    metrics.total_capacity,
    highest_route.name,
    highest_route.utilization_percentage
  from metrics
  left join selected_routes on true
  left join highest_route on true
  where selected_routes.id is not null
     or coalesce(array_length(p_route_ids, 1), 0) = 0;
$$;

revoke all on function public.education_get_transport_dashboard_summary(
  uuid, uuid[], uuid[]
) from public, anon;
grant execute on function public.education_get_transport_dashboard_summary(
  uuid, uuid[], uuid[]
) to authenticated;

commit;
