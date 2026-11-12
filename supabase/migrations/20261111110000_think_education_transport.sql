begin;

create table if not exists public.education_transport_vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  registration_number text not null check (char_length(btrim(registration_number)) between 1 and 32),
  make_model text not null check (char_length(btrim(make_model)) between 1 and 120),
  capacity smallint not null check (capacity between 1 and 200),
  status text not null default 'active' check (status in ('active', 'maintenance', 'retired')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict
);

create unique index if not exists education_transport_vehicle_registration_idx
  on public.education_transport_vehicles (org_id, branch_id, lower(btrim(registration_number)));
create index if not exists education_transport_vehicle_status_idx
  on public.education_transport_vehicles (org_id, branch_id, status);

create table if not exists public.education_transport_routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  vehicle_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  driver_name text not null check (char_length(btrim(driver_name)) between 1 and 120),
  driver_phone text check (driver_phone is null or char_length(btrim(driver_phone)) <= 32),
  stops text[] not null check (cardinality(stops) between 2 and 30),
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, vehicle_id)
    references public.education_transport_vehicles(org_id, branch_id, id) on delete restrict
);

create unique index if not exists education_transport_route_name_idx
  on public.education_transport_routes (org_id, branch_id, lower(btrim(name)));
create unique index if not exists education_transport_active_vehicle_route_idx
  on public.education_transport_routes (org_id, branch_id, vehicle_id)
  where status = 'active';
create index if not exists education_transport_route_status_idx
  on public.education_transport_routes (org_id, branch_id, status, name);

create table if not exists public.education_transport_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  route_id uuid not null,
  student_id uuid not null,
  pickup_stop text not null check (char_length(btrim(pickup_stop)) between 1 and 120),
  dropoff_stop text not null check (char_length(btrim(dropoff_stop)) between 1 and 120),
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  ended_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, branch_id, route_id)
    references public.education_transport_routes(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  check ((status = 'active' and ends_on is null and ended_by is null)
    or (status = 'ended' and ends_on is not null and ended_by is not null)),
  check (lower(btrim(pickup_stop)) <> lower(btrim(dropoff_stop)))
);

create unique index if not exists education_transport_one_active_assignment_per_student_idx
  on public.education_transport_assignments (org_id, student_id)
  where status = 'active';
create index if not exists education_transport_assignments_route_idx
  on public.education_transport_assignments (org_id, branch_id, route_id, status);
create index if not exists education_transport_assignments_student_idx
  on public.education_transport_assignments (org_id, branch_id, student_id, status);

alter table public.education_transport_vehicles enable row level security;
alter table public.education_transport_routes enable row level security;
alter table public.education_transport_assignments enable row level security;

create policy "education transport vehicles read"
  on public.education_transport_vehicles for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_transport', 'view'));

create policy "education transport routes read"
  on public.education_transport_routes for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_transport', 'view'));

create policy "education transport assignments read"
  on public.education_transport_assignments for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_transport', 'view'));

create or replace function public.education_transport_create_vehicle(
  p_org_id uuid,
  p_branch_id uuid,
  p_registration_number text,
  p_make_model text,
  p_capacity integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  vehicle_id uuid;
begin
  if auth.uid() is null
    or p_registration_number is null
    or char_length(btrim(p_registration_number)) not between 1 and 32
    or p_make_model is null or char_length(btrim(p_make_model)) not between 1 and 120
    or p_capacity is null or p_capacity not between 1 and 200 then
    raise exception 'Vehicle details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_transport', 'create') then
    raise exception 'You are not authorized to add vehicles at this campus.' using errcode = '42501';
  end if;

  insert into public.education_transport_vehicles (
    org_id, branch_id, registration_number, make_model, capacity, created_by
  ) values (
    p_org_id, p_branch_id, upper(btrim(p_registration_number)), btrim(p_make_model), p_capacity, auth.uid()
  ) returning id into vehicle_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_transport_vehicle_created', 'education_transport_vehicle', vehicle_id,
    jsonb_build_object('branch_id', p_branch_id, 'registration_number', upper(btrim(p_registration_number)), 'capacity', p_capacity)
  );
  return vehicle_id;
end;
$$;

create or replace function public.education_transport_create_route(
  p_org_id uuid,
  p_branch_id uuid,
  p_vehicle_id uuid,
  p_name text,
  p_driver_name text,
  p_driver_phone text,
  p_stops text[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  vehicle_row public.education_transport_vehicles%rowtype;
  route_id uuid;
  normalized_stops text[];
begin
  if auth.uid() is null
    or p_name is null or char_length(btrim(p_name)) not between 1 and 100
    or p_driver_name is null or char_length(btrim(p_driver_name)) not between 1 and 120
    or char_length(coalesce(p_driver_phone, '')) > 32
    or p_stops is null or cardinality(p_stops) not between 2 and 30
    or exists (select 1 from unnest(p_stops) as stops(stop) where stop is null or btrim(stop) = '')
    or (select count(distinct lower(btrim(stop))) from unnest(p_stops) as stops(stop)) <> cardinality(p_stops) then
    raise exception 'Route details and at least two unique stops are required.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_transport', 'create') then
    raise exception 'You are not authorized to create routes at this campus.' using errcode = '42501';
  end if;

  select * into vehicle_row
  from public.education_transport_vehicles
  where org_id = p_org_id and branch_id = p_branch_id and id = p_vehicle_id
  for update;
  if not found or vehicle_row.status <> 'active' then
    raise exception 'Select an active vehicle at this campus.' using errcode = 'P0002';
  end if;
  select array_agg(btrim(stop) order by stop_order) into normalized_stops
  from unnest(p_stops) with ordinality as stops(stop, stop_order);

  insert into public.education_transport_routes (
    org_id, branch_id, vehicle_id, name, driver_name, driver_phone, stops, created_by
  ) values (
    p_org_id, p_branch_id, p_vehicle_id, btrim(p_name), btrim(p_driver_name),
    nullif(btrim(p_driver_phone), ''), normalized_stops, auth.uid()
  ) returning id into route_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_transport_route_created', 'education_transport_route', route_id,
    jsonb_build_object('branch_id', p_branch_id, 'vehicle_id', p_vehicle_id, 'name', btrim(p_name), 'stops', normalized_stops)
  );
  return route_id;
end;
$$;

create or replace function public.education_transport_assign_student(
  p_org_id uuid,
  p_route_id uuid,
  p_student_number text,
  p_pickup_stop text,
  p_dropoff_stop text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  route_row public.education_transport_routes%rowtype;
  vehicle_row public.education_transport_vehicles%rowtype;
  student_row public.education_students%rowtype;
  active_assignment_count integer;
  assignment_id uuid;
begin
  if auth.uid() is null
    or p_student_number is null or char_length(btrim(p_student_number)) not between 1 and 80
    or p_pickup_stop is null or char_length(btrim(p_pickup_stop)) not between 1 and 120
    or p_dropoff_stop is null or char_length(btrim(p_dropoff_stop)) not between 1 and 120
    or lower(btrim(p_pickup_stop)) = lower(btrim(p_dropoff_stop)) then
    raise exception 'Student and distinct pickup and drop-off stops are required.' using errcode = '22023';
  end if;

  select * into route_row
  from public.education_transport_routes
  where org_id = p_org_id and id = p_route_id
  for update;
  if not found then
    raise exception 'The transport route was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, route_row.branch_id, 'education_transport', 'create')
    or not public.education_can_access_branch(p_org_id, route_row.branch_id, 'education_students', 'view') then
    raise exception 'You are not authorized to assign students to this route.' using errcode = '42501';
  end if;
  if route_row.status <> 'active'
    or not (route_row.stops @> array[btrim(p_pickup_stop), btrim(p_dropoff_stop)]::text[])
    or array_position(route_row.stops, btrim(p_pickup_stop)) >= array_position(route_row.stops, btrim(p_dropoff_stop)) then
    raise exception 'The route is inactive or the stops are not in valid route order.' using errcode = '22023';
  end if;

  select * into vehicle_row
  from public.education_transport_vehicles
  where org_id = p_org_id and branch_id = route_row.branch_id and id = route_row.vehicle_id
  for update;
  if not found or vehicle_row.status <> 'active' then
    raise exception 'The route vehicle is not active.' using errcode = '22023';
  end if;

  select * into student_row
  from public.education_students
  where org_id = p_org_id and branch_id = route_row.branch_id
    and student_number = btrim(p_student_number) and status = 'active'
  for update;
  if not found then
    raise exception 'An active student with that number was not found at this campus.' using errcode = 'P0002';
  end if;

  select count(*) into active_assignment_count
  from public.education_transport_assignments assignment
  where assignment.org_id = p_org_id and assignment.route_id = p_route_id and assignment.status = 'active';
  if active_assignment_count >= vehicle_row.capacity then
    raise exception 'This route has reached vehicle capacity.' using errcode = '22023';
  end if;

  insert into public.education_transport_assignments (
    org_id, branch_id, route_id, student_id, pickup_stop, dropoff_stop, created_by
  ) values (
    p_org_id, route_row.branch_id, p_route_id, student_row.id, btrim(p_pickup_stop), btrim(p_dropoff_stop), auth.uid()
  ) returning id into assignment_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_transport_student_assigned', 'education_transport_assignment', assignment_id,
    jsonb_build_object('branch_id', route_row.branch_id, 'route_id', p_route_id, 'student_id', student_row.id, 'pickup_stop', btrim(p_pickup_stop), 'dropoff_stop', btrim(p_dropoff_stop))
  );
  return assignment_id;
end;
$$;

create or replace function public.education_transport_end_assignment(
  p_org_id uuid,
  p_assignment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row public.education_transport_assignments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to end an assignment.' using errcode = '42501';
  end if;
  select * into assignment_row
  from public.education_transport_assignments
  where org_id = p_org_id and id = p_assignment_id
  for update;
  if not found then
    raise exception 'The transport assignment was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, assignment_row.branch_id, 'education_transport', 'edit') then
    raise exception 'You are not authorized to end this transport assignment.' using errcode = '42501';
  end if;
  if assignment_row.status <> 'active' then
    raise exception 'This transport assignment has already ended.' using errcode = '22023';
  end if;

  update public.education_transport_assignments
  set status = 'ended', ends_on = current_date, ended_by = auth.uid(), updated_at = now()
  where org_id = p_org_id and id = p_assignment_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_transport_assignment_ended', 'education_transport_assignment', p_assignment_id,
    jsonb_build_object('branch_id', assignment_row.branch_id, 'route_id', assignment_row.route_id, 'student_id', assignment_row.student_id, 'ends_on', current_date)
  );
  return true;
end;
$$;

create or replace function public.education_transport_set_vehicle_status(
  p_org_id uuid,
  p_vehicle_id uuid,
  p_status text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  vehicle_row public.education_transport_vehicles%rowtype;
begin
  if auth.uid() is null or p_status is null or p_status not in ('active', 'maintenance', 'retired') then
    raise exception 'Vehicle status is invalid.' using errcode = '22023';
  end if;
  select * into vehicle_row
  from public.education_transport_vehicles
  where org_id = p_org_id and id = p_vehicle_id
  for update;
  if not found then
    raise exception 'The transport vehicle was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, vehicle_row.branch_id, 'education_transport', 'edit') then
    raise exception 'You are not authorized to update this vehicle.' using errcode = '42501';
  end if;
  if p_status = 'retired' and exists (
    select 1 from public.education_transport_routes route
    where route.org_id = p_org_id and route.branch_id = vehicle_row.branch_id
      and route.vehicle_id = p_vehicle_id and route.status = 'active'
  ) then
    raise exception 'Pause or retire active routes before retiring this vehicle.' using errcode = '22023';
  end if;

  update public.education_transport_vehicles
  set status = p_status, updated_at = now()
  where org_id = p_org_id and id = p_vehicle_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_transport_vehicle_status_changed', 'education_transport_vehicle', p_vehicle_id,
    jsonb_build_object('branch_id', vehicle_row.branch_id, 'previous_status', vehicle_row.status, 'status', p_status)
  );
  return true;
end;
$$;

create or replace function public.education_transport_set_route_status(
  p_org_id uuid,
  p_route_id uuid,
  p_status text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  route_row public.education_transport_routes%rowtype;
  vehicle_row public.education_transport_vehicles%rowtype;
begin
  if auth.uid() is null or p_status is null or p_status not in ('active', 'paused', 'retired') then
    raise exception 'Route status is invalid.' using errcode = '22023';
  end if;
  select * into route_row
  from public.education_transport_routes
  where org_id = p_org_id and id = p_route_id
  for update;
  if not found then
    raise exception 'The transport route was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, route_row.branch_id, 'education_transport', 'edit') then
    raise exception 'You are not authorized to update this route.' using errcode = '42501';
  end if;
  if p_status = 'active' then
    select * into vehicle_row
    from public.education_transport_vehicles
    where org_id = p_org_id and branch_id = route_row.branch_id and id = route_row.vehicle_id
    for update;
    if not found or vehicle_row.status <> 'active' then
      raise exception 'Activate the route vehicle before activating this route.' using errcode = '22023';
    end if;
  end if;
  if p_status = 'retired' and exists (
    select 1 from public.education_transport_assignments assignment
    where assignment.org_id = p_org_id and assignment.route_id = p_route_id and assignment.status = 'active'
  ) then
    raise exception 'End all active student assignments before retiring this route.' using errcode = '22023';
  end if;

  update public.education_transport_routes
  set status = p_status, updated_at = now()
  where org_id = p_org_id and id = p_route_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_transport_route_status_changed', 'education_transport_route', p_route_id,
    jsonb_build_object('branch_id', route_row.branch_id, 'previous_status', route_row.status, 'status', p_status)
  );
  return true;
end;
$$;

revoke all on function public.education_transport_create_vehicle(uuid, uuid, text, text, integer) from public, anon;
grant execute on function public.education_transport_create_vehicle(uuid, uuid, text, text, integer) to authenticated;
revoke all on function public.education_transport_create_route(uuid, uuid, uuid, text, text, text, text[]) from public, anon;
grant execute on function public.education_transport_create_route(uuid, uuid, uuid, text, text, text, text[]) to authenticated;
revoke all on function public.education_transport_assign_student(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.education_transport_assign_student(uuid, uuid, text, text, text) to authenticated;
revoke all on function public.education_transport_end_assignment(uuid, uuid) from public, anon;
grant execute on function public.education_transport_end_assignment(uuid, uuid) to authenticated;
revoke all on function public.education_transport_set_vehicle_status(uuid, uuid, text) from public, anon;
grant execute on function public.education_transport_set_vehicle_status(uuid, uuid, text) to authenticated;
revoke all on function public.education_transport_set_route_status(uuid, uuid, text) from public, anon;
grant execute on function public.education_transport_set_route_status(uuid, uuid, text) to authenticated;

grant select on public.education_transport_vehicles, public.education_transport_routes, public.education_transport_assignments to authenticated;
revoke insert, update, delete on public.education_transport_vehicles, public.education_transport_routes, public.education_transport_assignments from authenticated;
revoke all on public.education_transport_vehicles, public.education_transport_routes, public.education_transport_assignments from anon;

commit;
