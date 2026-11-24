begin;

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
      vehicle.capacity
    from public.education_transport_routes route
    join public.education_transport_vehicles vehicle
      on vehicle.org_id = route.org_id
      and vehicle.branch_id = route.branch_id
      and vehicle.id = route.vehicle_id
    where route.org_id = p_org_id
      and route.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and public.education_can_access_branch(
        p_org_id, route.branch_id, 'education_transport', 'view'
      )
  ),
  assignment_counts as (
    select assignment.route_id, count(*)::bigint as active_assignment_count
    from public.education_transport_assignments assignment
    join scoped_routes route on route.id = assignment.route_id
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
      coalesce(assignment_counts.active_assignment_count, 0)::bigint as active_assignment_count,
      case
        when route.capacity > 0 then
          round((coalesce(assignment_counts.active_assignment_count, 0)::numeric / route.capacity) * 1000) / 10
        else 0
      end as utilization_percentage
    from scoped_routes route
    left join assignment_counts on assignment_counts.route_id = route.id
  ),
  metrics as (
    select
      count(*) filter (
        where route_status = 'active' and vehicle_status = 'active'
      )::bigint as active_route_count,
      coalesce(sum(active_assignment_count), 0)::bigint as assigned_students,
      coalesce(sum(capacity), 0)::bigint as total_capacity
    from route_summaries
  ),
  highest_route as (
    select name, utilization_percentage
    from route_summaries
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
