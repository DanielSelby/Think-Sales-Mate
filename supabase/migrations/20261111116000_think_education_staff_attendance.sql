create or replace function public.education_record_staff_attendance(
  p_org_id uuid,
  p_branch_id uuid,
  p_staff_id uuid,
  p_attendance_date date,
  p_status text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.education_staff%rowtype;
  attendance_row public.education_attendance%rowtype;
  previous_status text;
  attendance_action text;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_staff_id is null or p_attendance_date is null
    or p_status is null or p_status not in ('present', 'absent', 'late', 'excused')
    or (p_note is not null and length(btrim(p_note)) > 500) then
    raise exception 'Staff attendance details are invalid.' using errcode = '22023';
  end if;

  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = p_org_id
    and staff.branch_id = p_branch_id
    and staff.id = p_staff_id
    and staff.status = 'active'
  for update;
  if not found then
    raise exception 'The staff member is unavailable at this campus.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
    p_org_id, p_branch_id, 'education_attendance', 'view'
  ) then
    raise exception 'You cannot access staff attendance at this campus.' using errcode = '42501';
  end if;

  select attendance.* into attendance_row
  from public.education_attendance attendance
  where attendance.org_id = p_org_id
    and attendance.staff_id = p_staff_id
    and attendance.attendance_date = p_attendance_date
  for update;

  if found then
    if attendance_row.branch_id <> p_branch_id then
      raise exception 'The existing attendance record belongs to a different campus.' using errcode = 'P0002';
    end if;
    if not public.education_can_access_branch(
      p_org_id, p_branch_id, 'education_attendance', 'edit'
    ) then
      raise exception 'You cannot correct staff attendance at this campus.' using errcode = '42501';
    end if;
    previous_status := attendance_row.status;
    update public.education_attendance
    set status = p_status,
        note = nullif(btrim(p_note), ''),
        recorded_by = auth.uid()
    where id = attendance_row.id
      and org_id = p_org_id
    returning * into attendance_row;
    attendance_action := 'education_staff_attendance_corrected';
  else
    if not public.education_can_access_branch(
      p_org_id, p_branch_id, 'education_attendance', 'create'
    ) then
      raise exception 'You cannot record staff attendance at this campus.' using errcode = '42501';
    end if;
    insert into public.education_attendance (
      org_id, branch_id, staff_id, attendance_date, status, note, recorded_by
    ) values (
      p_org_id, p_branch_id, p_staff_id, p_attendance_date,
      p_status, nullif(btrim(p_note), ''), auth.uid()
    )
    returning * into attendance_row;
    attendance_action := 'education_staff_attendance_recorded';
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    attendance_action,
    'education_attendance',
    attendance_row.id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'staff_id', p_staff_id,
      'attendance_date', p_attendance_date,
      'previous_status', previous_status,
      'status', p_status
    )
  );
  return attendance_row.id;
end;
$$;

revoke all on function public.education_record_staff_attendance(uuid, uuid, uuid, date, text, text)
  from public, anon;
grant execute on function public.education_record_staff_attendance(uuid, uuid, uuid, date, text, text)
  to authenticated;
