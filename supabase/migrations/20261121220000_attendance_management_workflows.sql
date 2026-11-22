begin;

create unique index if not exists employees_org_id_id_attendance_idx
  on public.employees (org_id, id);

create unique index if not exists attendance_records_org_id_id_attendance_idx
  on public.attendance_records (org_id, id);

alter table public.business_locations
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists geofence_radius_meters integer not null default 100,
  add column if not exists gps_verification_required boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'business_locations_coordinates_check'
  ) then
    alter table public.business_locations
      add constraint business_locations_coordinates_check
      check (
        (latitude is null and longitude is null)
        or (
          latitude between -90 and 90
          and longitude between -180 and 180
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'business_locations_geofence_radius_check'
  ) then
    alter table public.business_locations
      add constraint business_locations_geofence_radius_check
      check (geofence_radius_meters between 10 and 10000);
  end if;
end;
$$;

create table if not exists public.attendance_management_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  work_start_time time not null default '09:00',
  work_end_time time not null default '17:00',
  grace_period_minutes integer not null default 15 check (grace_period_minutes between 0 and 240),
  late_threshold_minutes integer not null default 15 check (late_threshold_minutes between 0 and 480),
  standard_daily_hours numeric(4, 2) not null default 8 check (standard_daily_hours between 1 and 24),
  overtime_threshold_minutes integer not null default 0 check (overtime_threshold_minutes between 0 and 720),
  overtime_rate_multiplier numeric(4, 2) not null default 1.5 check (overtime_rate_multiplier between 1 and 10),
  geofencing_enabled boolean not null default false,
  gps_verification_required boolean not null default false,
  notify_late_arrival boolean not null default true,
  notify_absence boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (work_end_time <> work_start_time)
);

create table if not exists public.attendance_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  starts_at time not null,
  ends_at time not null,
  working_days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  department text,
  location_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete restrict,
  check (starts_at <> ends_at),
  check (cardinality(working_days) between 1 and 7),
  check (working_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

create index if not exists attendance_shifts_org_status_idx
  on public.attendance_shifts (org_id, status, name);

create table if not exists public.attendance_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shift_id uuid not null,
  employee_id uuid not null,
  location_id uuid,
  assignment_date date not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, employee_id, assignment_date),
  foreign key (org_id, shift_id)
    references public.attendance_shifts(org_id, id) on delete cascade,
  foreign key (org_id, employee_id)
    references public.employees(org_id, id) on delete cascade,
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete restrict
);

create index if not exists attendance_shift_assignments_org_date_idx
  on public.attendance_shift_assignments (org_id, assignment_date, location_id);

create table if not exists public.attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  attendance_record_id uuid,
  employee_id uuid not null,
  location_id uuid,
  work_date date not null,
  original_check_in timestamptz,
  requested_check_in timestamptz,
  original_check_out timestamptz,
  requested_check_out timestamptz,
  reason text not null check (length(trim(reason)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, attendance_record_id)
    references public.attendance_records(org_id, id) on delete set null (attendance_record_id),
  foreign key (org_id, employee_id)
    references public.employees(org_id, id) on delete cascade,
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete restrict,
  check (requested_check_in is not null or requested_check_out is not null),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);

create index if not exists attendance_correction_requests_org_status_idx
  on public.attendance_correction_requests (org_id, status, created_at desc);

create table if not exists public.attendance_break_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  duration_minutes integer not null check (duration_minutes between 1 and 480),
  is_paid boolean not null default false,
  applies_after_hours numeric(4, 2) not null default 4 check (applies_after_hours between 0 and 24),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

create table if not exists public.attendance_break_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  attendance_record_id uuid,
  policy_id uuid,
  location_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, employee_id)
    references public.employees(org_id, id) on delete cascade,
  foreign key (org_id, attendance_record_id)
    references public.attendance_records(org_id, id) on delete set null (attendance_record_id),
  foreign key (org_id, policy_id)
    references public.attendance_break_policies(org_id, id) on delete set null (policy_id),
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete restrict,
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists attendance_break_sessions_one_open_per_employee_idx
  on public.attendance_break_sessions (org_id, employee_id)
  where ended_at is null;
create index if not exists attendance_break_sessions_org_started_idx
  on public.attendance_break_sessions (org_id, started_at desc);

create table if not exists public.attendance_overtime_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  attendance_record_id uuid not null,
  employee_id uuid not null,
  location_id uuid,
  requested_hours numeric(5, 2) not null check (requested_hours > 0 and requested_hours <= 24),
  approved_hours numeric(5, 2) check (approved_hours is null or (approved_hours >= 0 and approved_hours <= requested_hours)),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, attendance_record_id)
    references public.attendance_records(org_id, id) on delete cascade,
  foreign key (org_id, employee_id)
    references public.employees(org_id, id) on delete cascade,
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete restrict,
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);

create index if not exists attendance_overtime_requests_org_status_idx
  on public.attendance_overtime_requests (org_id, status, created_at desc);

create or replace function public.audit_attendance_management_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb;
  target_org_id uuid;
  target_entity_id uuid;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;
  target_org_id := (row_data ->> 'org_id')::uuid;
  target_entity_id := coalesce(
    nullif(row_data ->> 'id', '')::uuid,
    target_org_id
  );
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    target_org_id,
    auth.uid(),
    'attendance_management.' || lower(tg_op),
    tg_table_name,
    target_entity_id,
    jsonb_build_object('record', row_data)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_attendance_management_change() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'attendance_management_settings',
    'attendance_shifts',
    'attendance_shift_assignments',
    'attendance_correction_requests',
    'attendance_break_policies',
    'attendance_break_sessions',
    'attendance_overtime_requests'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_attendance_management_change()',
      table_name || '_audit_trigger', table_name);
  end loop;
end;
$$;

create policy "attendance settings read" on public.attendance_management_settings
  for select using (public.has_org_permission(org_id, 'hrm_payroll', 'view'));
create policy "attendance settings insert" on public.attendance_management_settings
  for insert with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'create')
    or public.has_org_permission(org_id, 'hrm_payroll', 'edit')
  );
create policy "attendance settings update" on public.attendance_management_settings
  for update using (public.has_org_permission(org_id, 'hrm_payroll', 'edit'))
  with check (public.has_org_permission(org_id, 'hrm_payroll', 'edit'));

create policy "attendance shifts read" on public.attendance_shifts
  for select using (
    public.has_org_permission(org_id, 'hrm_payroll', 'view')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance shifts insert" on public.attendance_shifts
  for insert with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'create')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance shifts update" on public.attendance_shifts
  for update using (
    public.has_org_permission(org_id, 'hrm_payroll', 'edit')
    and public.can_access_org_location(org_id, location_id)
  ) with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'edit')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance shifts delete" on public.attendance_shifts
  for delete using (
    public.has_org_permission(org_id, 'hrm_payroll', 'delete')
    and public.can_access_org_location(org_id, location_id)
  );

create policy "attendance shift assignments read" on public.attendance_shift_assignments
  for select using (
    public.has_org_permission(org_id, 'hrm_payroll', 'view')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance shift assignments insert" on public.attendance_shift_assignments
  for insert with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'create')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance shift assignments update" on public.attendance_shift_assignments
  for update using (
    public.has_org_permission(org_id, 'hrm_payroll', 'edit')
    and public.can_access_org_location(org_id, location_id)
  ) with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'edit')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance shift assignments delete" on public.attendance_shift_assignments
  for delete using (
    public.has_org_permission(org_id, 'hrm_payroll', 'delete')
    and public.can_access_org_location(org_id, location_id)
  );

create policy "attendance corrections read" on public.attendance_correction_requests
  for select using (
    public.has_org_permission(org_id, 'hrm_payroll', 'view')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance corrections create" on public.attendance_correction_requests
  for insert with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'create')
    and requested_by = auth.uid()
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance break policies read" on public.attendance_break_policies
  for select using (public.has_org_permission(org_id, 'hrm_payroll', 'view'));
create policy "attendance break policies insert" on public.attendance_break_policies
  for insert with check (public.has_org_permission(org_id, 'hrm_payroll', 'create'));
create policy "attendance break policies update" on public.attendance_break_policies
  for update using (public.has_org_permission(org_id, 'hrm_payroll', 'edit'))
  with check (public.has_org_permission(org_id, 'hrm_payroll', 'edit'));
create policy "attendance break policies delete" on public.attendance_break_policies
  for delete using (public.has_org_permission(org_id, 'hrm_payroll', 'delete'));

create policy "attendance breaks read" on public.attendance_break_sessions
  for select using (
    public.has_org_permission(org_id, 'hrm_payroll', 'view')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance breaks start" on public.attendance_break_sessions
  for insert with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'create')
    and created_by = auth.uid()
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance breaks end" on public.attendance_break_sessions
  for update using (
    public.has_org_permission(org_id, 'hrm_payroll', 'edit')
    and ended_at is null
    and public.can_access_org_location(org_id, location_id)
  ) with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'edit')
    and public.can_access_org_location(org_id, location_id)
  );

create policy "attendance overtime read" on public.attendance_overtime_requests
  for select using (
    public.has_org_permission(org_id, 'hrm_payroll', 'view')
    and public.can_access_org_location(org_id, location_id)
  );
create policy "attendance overtime create" on public.attendance_overtime_requests
  for insert with check (
    public.has_org_permission(org_id, 'hrm_payroll', 'create')
    and requested_by = auth.uid()
    and public.can_access_org_location(org_id, location_id)
  );
create or replace function public.update_attendance_location_geofence(
  p_org_id uuid,
  p_location_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_radius_meters integer,
  p_gps_verification_required boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_org_permission(p_org_id, 'hrm_payroll', 'edit')
    or not public.can_access_org_location(p_org_id, p_location_id) then
    raise exception 'You do not have permission to update attendance geofencing for this branch.'
      using errcode = '42501';
  end if;

  update public.business_locations
  set latitude = p_latitude,
      longitude = p_longitude,
      geofence_radius_meters = p_radius_meters,
      gps_verification_required = p_gps_verification_required
  where org_id = p_org_id and id = p_location_id;
  if not found then
    raise exception 'The selected branch does not belong to this organization.';
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    'attendance_management.geofence_updated',
    'business_locations',
    p_location_id,
    jsonb_build_object(
      'latitude', p_latitude,
      'longitude', p_longitude,
      'geofence_radius_meters', p_radius_meters,
      'gps_verification_required', p_gps_verification_required
    )
  );
end;
$$;

revoke all on function public.update_attendance_location_geofence(uuid, uuid, numeric, numeric, integer, boolean) from public, anon;
grant execute on function public.update_attendance_location_geofence(uuid, uuid, numeric, numeric, integer, boolean) to authenticated;

create or replace function public.review_attendance_correction(
  p_request_id uuid,
  p_decision text,
  p_decision_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.attendance_correction_requests;
  existing_record public.attendance_records;
  next_check_in timestamptz;
  next_check_out timestamptz;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Attendance correction decision is invalid.';
  end if;
  select * into request_row
  from public.attendance_correction_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending attendance correction was not found.';
  end if;
  if not public.has_org_permission(request_row.org_id, 'hrm_payroll', 'approve')
    or not public.can_access_org_location(request_row.org_id, request_row.location_id) then
    raise exception 'You do not have permission to review this attendance correction.'
      using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    select * into existing_record
    from public.attendance_records
    where org_id = request_row.org_id
      and employee_id = request_row.employee_id
      and work_date = request_row.work_date
    for update;
    if existing_record.id is not null and (
      (request_row.attendance_record_id is not null and request_row.attendance_record_id <> existing_record.id)
      or (request_row.location_id is not null and request_row.location_id is distinct from existing_record.location_id)
      or not public.can_access_org_location(request_row.org_id, existing_record.location_id)
    ) then
      raise exception 'The attendance record has changed or is outside your branch access.'
        using errcode = '42501';
    end if;

    next_check_in := coalesce(request_row.requested_check_in, existing_record.check_in);
    next_check_out := coalesce(request_row.requested_check_out, existing_record.check_out);

    insert into public.attendance_records (
      org_id, employee_id, location_id, work_date, check_in, check_out, status,
      total_hours, created_by
    )
    values (
      request_row.org_id,
      request_row.employee_id,
      request_row.location_id,
      request_row.work_date,
      next_check_in,
      next_check_out,
      case when next_check_in is null then 'absent'::public.attendance_status else 'present'::public.attendance_status end,
      case when next_check_in is not null and next_check_out is not null
        then greatest(0, round((extract(epoch from (next_check_out - next_check_in)) / 3600)::numeric, 2))
        else 0
      end,
      auth.uid()
    )
    on conflict (employee_id, work_date) do update
    set location_id = coalesce(request_row.location_id, public.attendance_records.location_id),
        check_in = coalesce(request_row.requested_check_in, public.attendance_records.check_in),
        check_out = coalesce(request_row.requested_check_out, public.attendance_records.check_out),
        status = case
          when coalesce(request_row.requested_check_in, public.attendance_records.check_in) is null
            then 'absent'::public.attendance_status
          when public.attendance_records.status = 'late'::public.attendance_status
            then 'late'::public.attendance_status
          else 'present'::public.attendance_status
        end,
        total_hours = case
          when coalesce(request_row.requested_check_in, public.attendance_records.check_in) is not null
            and coalesce(request_row.requested_check_out, public.attendance_records.check_out) is not null
          then greatest(0, round((
            extract(epoch from (
              coalesce(request_row.requested_check_out, public.attendance_records.check_out)
              - coalesce(request_row.requested_check_in, public.attendance_records.check_in)
            )) / 3600
          )::numeric, 2))
          else 0
        end;
  end if;

  update public.attendance_correction_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      decision_note = nullif(trim(p_decision_note), '')
  where id = p_request_id;
end;
$$;

revoke all on function public.review_attendance_correction(uuid, text, text) from public, anon;
grant execute on function public.review_attendance_correction(uuid, text, text) to authenticated;

create or replace function public.review_attendance_overtime_request(
  p_request_id uuid,
  p_decision text,
  p_approved_hours numeric default null,
  p_decision_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.attendance_overtime_requests;
  attendance_record public.attendance_records;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Overtime decision is invalid.';
  end if;
  select * into request_row
  from public.attendance_overtime_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending overtime request was not found.';
  end if;
  if not public.has_org_permission(request_row.org_id, 'hrm_payroll', 'approve')
    or not public.can_access_org_location(request_row.org_id, request_row.location_id) then
    raise exception 'You do not have permission to review this overtime request.'
      using errcode = '42501';
  end if;
  if p_decision = 'approved' and (
    p_approved_hours is null or p_approved_hours < 0
    or p_approved_hours > request_row.requested_hours
  ) then
    raise exception 'Approved overtime must be between zero and the requested hours.';
  end if;

  if p_decision = 'approved' then
    select * into attendance_record
    from public.attendance_records
    where org_id = request_row.org_id
      and id = request_row.attendance_record_id
    for update;
    if not found then
      raise exception 'Attendance record for this overtime request no longer exists.';
    end if;
    if attendance_record.employee_id <> request_row.employee_id
      or attendance_record.location_id is distinct from request_row.location_id
      or not public.can_access_org_location(request_row.org_id, attendance_record.location_id) then
      raise exception 'The overtime request does not match an accessible attendance record.'
        using errcode = '42501';
    end if;

    update public.attendance_records
    set overtime_hours = coalesce(overtime_hours, 0) + p_approved_hours
    where org_id = request_row.org_id
      and id = request_row.attendance_record_id;
    if not found then
      raise exception 'Attendance record for this overtime request no longer exists.';
    end if;
  end if;

  update public.attendance_overtime_requests
  set status = p_decision,
      approved_hours = case when p_decision = 'approved' then p_approved_hours else null end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      decision_note = nullif(trim(p_decision_note), '')
  where id = p_request_id;
end;
$$;

revoke all on function public.review_attendance_overtime_request(uuid, text, numeric, text) from public, anon;
grant execute on function public.review_attendance_overtime_request(uuid, text, numeric, text) to authenticated;

commit;
