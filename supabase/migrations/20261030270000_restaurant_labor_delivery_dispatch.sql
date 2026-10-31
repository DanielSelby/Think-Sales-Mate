begin;

alter table public.attendance_records
  add column location_id uuid;

alter table public.attendance_records
  add constraint attendance_records_org_location_fkey
    foreign key (org_id, location_id)
    references public.business_locations(org_id, id)
    on delete restrict;

create index attendance_records_restaurant_location_date_idx
  on public.attendance_records(org_id, location_id, work_date)
  where location_id is not null;

create or replace function public.validate_attendance_record_location()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.location_id is not null and not exists (
    select 1 from public.business_locations location
    where location.org_id = new.org_id and location.id = new.location_id
  ) then
    raise exception 'Attendance branch must belong to this organization.';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_validate_location on public.attendance_records;
create trigger attendance_records_validate_location
  before insert or update of org_id, location_id
  on public.attendance_records
  for each row execute function public.validate_attendance_record_location();

revoke all on function public.validate_attendance_record_location()
  from public, anon, authenticated;

create or replace function public.get_restaurant_labor_hours(
  p_org_id uuid,
  p_start_date date,
  p_end_date date,
  p_location_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can read Restaurant labor summaries.';
  end if;
  if p_org_id is null or p_start_date is null or p_end_date is null
    or p_end_date < p_start_date or p_end_date - p_start_date > 366 then
    raise exception 'Choose a valid Restaurant labor date range of no more than 366 days.';
  end if;
  if p_location_ids is null or cardinality(p_location_ids) = 0 then
    raise exception 'At least one accessible Restaurant branch is required.';
  end if;
  if exists (
    select 1 from unnest(p_location_ids) requested(location_id)
    where not exists (
      select 1 from public.business_locations location
      where location.org_id = p_org_id and location.id = requested.location_id
    )
  ) then
    raise exception 'Restaurant labor branches must belong to this organization.';
  end if;

  with branch_stats as (
    select location.id as location_id,
      location.name as location_name,
      coalesce(sum(record.total_hours), 0) as total_hours,
      count(distinct record.employee_id) filter (where record.total_hours > 0) as staff_count,
      count(record.id) filter (where record.total_hours > 0) as record_count
    from public.business_locations location
    left join public.attendance_records record
      on record.org_id = location.org_id
      and record.location_id = location.id
      and record.work_date between p_start_date and p_end_date
      and record.total_hours > 0
    where location.org_id = p_org_id
      and location.id = any(p_location_ids)
    group by location.id, location.name
  )
  select jsonb_build_object(
    'total_hours', coalesce(sum(branch_stats.total_hours), 0),
    'staff_count', (
      select count(distinct record.employee_id)
      from public.attendance_records record
      where record.org_id = p_org_id
        and record.location_id = any(p_location_ids)
        and record.work_date between p_start_date and p_end_date
        and record.total_hours > 0
    ),
    'record_count', coalesce(sum(branch_stats.record_count), 0),
    'by_branch', coalesce(jsonb_agg(jsonb_build_object(
      'location_id', branch_stats.location_id,
      'location_name', branch_stats.location_name,
      'total_hours', branch_stats.total_hours,
      'staff_count', branch_stats.staff_count,
      'record_count', branch_stats.record_count
    ) order by branch_stats.location_name), '[]'::jsonb)
  ) into result
  from branch_stats;
  return result;
end;
$$;

revoke all on function public.get_restaurant_labor_hours(uuid, date, date, uuid[])
  from public, anon, authenticated;
grant execute on function public.get_restaurant_labor_hours(uuid, date, date, uuid[])
  to service_role;

alter table public.restaurant_orders
  add column delivery_status text not null default 'not_applicable',
  add column delivery_assigned_employee_id uuid references public.employees(id) on delete restrict,
  add column delivery_assigned_at timestamptz,
  add column delivery_picked_up_at timestamptz,
  add column delivery_delivered_at timestamptz,
  add column delivery_failure_note text;

update public.restaurant_orders
set delivery_status = case when order_type = 'delivery' then 'unassigned' else 'not_applicable' end;

alter table public.restaurant_orders
  add constraint restaurant_orders_delivery_status_check
    check (delivery_status in ('not_applicable', 'unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed')),
  add constraint restaurant_orders_delivery_type_check
    check (
      (order_type = 'delivery' and delivery_status <> 'not_applicable')
      or (order_type <> 'delivery' and delivery_status = 'not_applicable')
    ),
  add constraint restaurant_orders_delivery_assignee_check
    check (
      (delivery_status in ('unassigned', 'not_applicable') and delivery_assigned_employee_id is null)
      or (delivery_status in ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed')
        and delivery_assigned_employee_id is not null)
    );

create index restaurant_orders_delivery_queue_idx
  on public.restaurant_orders(org_id, location_id, delivery_status, created_at)
  where order_type = 'delivery' and status not in ('completed', 'cancelled');

create or replace function public.guard_restaurant_delivery_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.order_type <> 'delivery' then
    new.delivery_status := 'not_applicable';
    new.delivery_assigned_employee_id := null;
    new.delivery_assigned_at := null;
    new.delivery_picked_up_at := null;
    new.delivery_delivered_at := null;
    new.delivery_failure_note := null;
    return new;
  end if;

  if new.delivery_status = 'not_applicable' then
    new.delivery_status := 'unassigned';
  end if;

  if new.delivery_assigned_employee_id is not null and not exists (
    select 1 from public.employees employee
    where employee.id = new.delivery_assigned_employee_id
      and employee.org_id = new.org_id
      and employee.status = 'active'
      and (employee.location_id is null or employee.location_id = new.location_id)
  ) then
    raise exception 'Assigned delivery staff must be active and assigned to this organization and branch.';
  end if;

  if new.status = 'completed' and new.delivery_status <> 'delivered' then
    raise exception 'A delivery order cannot be completed until it is marked delivered.';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_orders_guard_delivery_dispatch on public.restaurant_orders;
create trigger restaurant_orders_guard_delivery_dispatch
  before insert or update of order_type, org_id, location_id, status,
    delivery_status, delivery_assigned_employee_id
  on public.restaurant_orders
  for each row execute function public.guard_restaurant_delivery_dispatch();

revoke all on function public.guard_restaurant_delivery_dispatch()
  from public, anon, authenticated;

commit;
