begin;

create table if not exists public.attendance_shift_rotations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  location_id uuid,
  shift_ids uuid[] not null check (cardinality(shift_ids) between 2 and 7),
  employee_ids uuid[] not null check (cardinality(employee_ids) between 1 and 500),
  start_date date not null,
  weeks integer not null default 12 check (weeks between 1 and 52),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, location_id)
    references public.business_locations(org_id, id) on delete restrict
);

create index if not exists attendance_shift_rotations_org_start_idx
  on public.attendance_shift_rotations (org_id, start_date desc);

alter table public.attendance_shift_rotations enable row level security;
drop policy if exists "attendance shift rotations read" on public.attendance_shift_rotations;
drop trigger if exists attendance_shift_rotations_audit_trigger on public.attendance_shift_rotations;
create trigger attendance_shift_rotations_audit_trigger
  after insert or update or delete on public.attendance_shift_rotations
  for each row execute function public.audit_attendance_management_change();

create policy "attendance shift rotations read" on public.attendance_shift_rotations
  for select using (
    public.has_org_permission(org_id, 'hrm_payroll', 'view')
    and public.can_access_org_location(org_id, location_id)
  );

create or replace function public.create_attendance_shift_rotation(
  p_org_id uuid,
  p_name text,
  p_shift_ids uuid[],
  p_employee_ids uuid[],
  p_start_date date,
  p_weeks integer default 12
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rotation_id uuid;
  rotation_location_id uuid;
  selected_shift public.attendance_shifts;
  selected_week date;
  assignment_date date;
  week_index integer;
  shift_index integer;
  employee_id uuid;
  inserted_by uuid := auth.uid();
begin
  if inserted_by is null
    or not public.has_org_permission(p_org_id, 'hrm_payroll', 'create') then
    raise exception 'You do not have permission to create an attendance shift rotation.'
      using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'Enter a rotation name between 1 and 120 characters.';
  end if;
  if p_shift_ids is null or array_ndims(p_shift_ids) <> 1
    or cardinality(p_shift_ids) not between 2 and 7
    or array_position(p_shift_ids, null) is not null
    or cardinality(p_shift_ids) <> (select count(distinct selected.id) from unnest(p_shift_ids) as selected(id)) then
    raise exception 'Select between two and seven different shifts in rotation order.';
  end if;
  if p_employee_ids is null or array_ndims(p_employee_ids) <> 1
    or cardinality(p_employee_ids) not between 1 and 500
    or array_position(p_employee_ids, null) is not null
    or cardinality(p_employee_ids) <> (select count(distinct selected.id) from unnest(p_employee_ids) as selected(id)) then
    raise exception 'Select between one and 500 different employees.';
  end if;
  if p_start_date is null or p_start_date < current_date then
    raise exception 'The rotation start date must be today or a future date.';
  end if;
  if p_weeks is null or p_weeks not between 1 and 52 then
    raise exception 'Rotation schedules can be generated for 1 to 52 weeks.';
  end if;

  select shift.location_id into rotation_location_id
  from public.attendance_shifts as shift
  where shift.org_id = p_org_id
    and shift.id = p_shift_ids[1]
    and shift.status = 'active';
  if not found then
    raise exception 'The first selected shift is unavailable or inactive.';
  end if;
  if exists (
    select 1
    from unnest(p_shift_ids) as selected(id)
    left join public.attendance_shifts as shift
      on shift.org_id = p_org_id and shift.id = selected.id
    where shift.id is null
      or shift.status <> 'active'
      or shift.location_id is distinct from rotation_location_id
  ) then
    raise exception 'All selected shifts must be active and assigned to the same branch.';
  end if;
  if not public.can_access_org_location(p_org_id, rotation_location_id) then
    raise exception 'You cannot schedule a rotation for this branch.'
      using errcode = '42501';
  end if;
  if (
    select count(distinct employee.id)
    from unnest(p_employee_ids) as selected(id)
    join public.employees as employee
      on employee.org_id = p_org_id and employee.id = selected.id
  ) <> cardinality(p_employee_ids) then
    raise exception 'One or more selected employees do not belong to this organization.';
  end if;
  if exists (
    select 1
    from unnest(p_employee_ids) as selected(id)
    join public.employees as employee
      on employee.org_id = p_org_id and employee.id = selected.id
    where employee.status <> 'active'
      or not public.can_access_org_location(p_org_id, employee.location_id)
  ) then
    raise exception 'All selected employees must be active and within your branch access.'
      using errcode = '42501';
  end if;

  insert into public.attendance_shift_rotations (
    org_id, name, location_id, shift_ids, employee_ids, start_date, weeks, created_by
  )
  values (
    p_org_id, trim(p_name), rotation_location_id, p_shift_ids, p_employee_ids, p_start_date, p_weeks, inserted_by
  )
  returning id into rotation_id;

  for week_index in 0..(p_weeks - 1) loop
    shift_index := (week_index % cardinality(p_shift_ids)) + 1;
    selected_week := p_start_date + (week_index * 7);
    select * into selected_shift
    from public.attendance_shifts
    where org_id = p_org_id and id = p_shift_ids[shift_index];

    foreach employee_id in array p_employee_ids loop
      for assignment_date in
        select (selected_week + days.day_offset)::date
        from generate_series(0, 6) as days(day_offset)
        where extract(dow from selected_week + days.day_offset)::smallint = any(selected_shift.working_days)
      loop
        insert into public.attendance_shift_assignments (
          org_id, shift_id, employee_id, location_id, assignment_date, assigned_by
        )
        values (
          p_org_id, selected_shift.id, employee_id, rotation_location_id, assignment_date, inserted_by
        )
        on conflict (org_id, employee_id, assignment_date) do nothing;
      end loop;
    end loop;
  end loop;

  return rotation_id;
end;
$$;

revoke all on function public.create_attendance_shift_rotation(uuid, text, uuid[], uuid[], date, integer)
  from public, anon;
grant execute on function public.create_attendance_shift_rotation(uuid, text, uuid[], uuid[], date, integer)
  to authenticated;

create or replace function public.notify_attendance_record_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notify_late boolean;
  notify_absent boolean;
  notification_title text;
  notification_message text;
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
  end if;

  select settings.notify_late_arrival, settings.notify_absence
    into notify_late, notify_absent
  from public.attendance_management_settings as settings
  where settings.org_id = new.org_id;

  if new.status = 'late'::public.attendance_status and coalesce(notify_late, true) then
    notification_title := 'Late arrival recorded';
    notification_message := 'A late arrival was recorded for ' || new.work_date::text || '.';
  elsif new.status = 'absent'::public.attendance_status and coalesce(notify_absent, true) then
    notification_title := 'Absence recorded';
    notification_message := 'An absence was recorded for ' || new.work_date::text || '.';
  else
    return new;
  end if;

  insert into public.notifications (
    org_id, user_id, location_id, title, message, type, channel,
    entity_type, entity_id, is_read, status
  )
  values (
    new.org_id, null, new.location_id, notification_title, notification_message,
    'general', 'in_app', 'attendance_records', new.id, false, 'delivered'
  );

  return new;
end;
$$;

revoke all on function public.notify_attendance_record_status() from public, anon, authenticated;
drop trigger if exists attendance_record_status_notification_trigger on public.attendance_records;
create trigger attendance_record_status_notification_trigger
  after insert or update of status on public.attendance_records
  for each row execute function public.notify_attendance_record_status();

create or replace function public.notify_attendance_correction_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (
      org_id, user_id, location_id, title, message, type, channel,
      entity_type, entity_id, is_read, status
    )
    values (
      new.org_id, null, new.location_id, 'Attendance correction requested',
      'An attendance correction was requested for ' || new.work_date::text || '.',
      'general', 'in_app', 'attendance_correction_requests', new.id, false, 'delivered'
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.notifications (
      org_id, user_id, location_id, title, message, type, channel,
      entity_type, entity_id, is_read, status
    )
    values (
      new.org_id, new.requested_by, new.location_id, 'Attendance correction ' || new.status,
      'Your attendance correction request for ' || new.work_date::text || ' was ' || new.status || '.',
      'general', 'in_app', 'attendance_correction_requests', new.id, false, 'delivered'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_attendance_correction_request() from public, anon, authenticated;
drop trigger if exists attendance_correction_request_notification_trigger on public.attendance_correction_requests;
create trigger attendance_correction_request_notification_trigger
  after insert or update of status on public.attendance_correction_requests
  for each row execute function public.notify_attendance_correction_request();

create or replace function public.notify_attendance_overtime_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_date date;
begin
  if tg_op = 'INSERT' then
    select record.work_date into request_date
    from public.attendance_records as record
    where record.org_id = new.org_id and record.id = new.attendance_record_id;
    insert into public.notifications (
      org_id, user_id, location_id, title, message, type, channel,
      entity_type, entity_id, is_read, status
    )
    values (
      new.org_id, null, new.location_id, 'Overtime requested',
      'An overtime request was submitted for ' || coalesce(request_date::text, 'an attendance record') || '.',
      'general', 'in_app', 'attendance_overtime_requests', new.id, false, 'delivered'
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    select record.work_date into request_date
    from public.attendance_records as record
    where record.org_id = new.org_id and record.id = new.attendance_record_id;
    insert into public.notifications (
      org_id, user_id, location_id, title, message, type, channel,
      entity_type, entity_id, is_read, status
    )
    values (
      new.org_id, new.requested_by, new.location_id, 'Overtime request ' || new.status,
      'Your overtime request for ' || coalesce(request_date::text, 'an attendance record') || ' was ' || new.status || '.',
      'general', 'in_app', 'attendance_overtime_requests', new.id, false, 'delivered'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_attendance_overtime_request() from public, anon, authenticated;
drop trigger if exists attendance_overtime_request_notification_trigger on public.attendance_overtime_requests;
create trigger attendance_overtime_request_notification_trigger
  after insert or update of status on public.attendance_overtime_requests
  for each row execute function public.notify_attendance_overtime_request();

commit;
