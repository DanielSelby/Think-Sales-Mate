begin;

create or replace function public.education_update_timetable_entry(
  p_org_id uuid,
  p_entry_id uuid,
  p_expected_updated_at timestamptz,
  p_class_id uuid,
  p_staff_id uuid,
  p_weekday smallint,
  p_starts_at time,
  p_ends_at time,
  p_room text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.education_timetable_entries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to edit timetable entries.' using errcode = '42501';
  end if;
  select * into entry_row
  from public.education_timetable_entries
  where org_id = p_org_id and id = p_entry_id
  for update;
  if not found then
    raise exception 'The timetable entry was not found.' using errcode = 'P0002';
  end if;
  if entry_row.status <> 'active' then
    raise exception 'Only active timetable entries can be edited.' using errcode = '22023';
  end if;
  if entry_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This timetable entry changed. Refresh and try again.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
    p_org_id, entry_row.branch_id, 'education_timetables', 'edit'
  ) then
    raise exception 'You are not authorized to edit this timetable entry.' using errcode = '42501';
  end if;
  if p_weekday is null or p_weekday not between 1 and 7 or p_starts_at is null or p_ends_at is null
    or p_ends_at <= p_starts_at or p_room is not null and char_length(btrim(p_room)) > 80 then
    raise exception 'The timetable day, time, or room is invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_academic_years academic_year
    where academic_year.org_id = p_org_id
      and academic_year.id = entry_row.academic_year_id
      and academic_year.status in ('planned', 'active')
  ) then
    raise exception 'The timetable academic year is no longer active.' using errcode = '22023';
  end if;
  if p_class_id is distinct from entry_row.class_id and not exists (
    select 1
    from public.education_classes classroom
    where classroom.org_id = p_org_id
      and classroom.branch_id = entry_row.branch_id
      and classroom.id = p_class_id
      and classroom.academic_year_id = entry_row.academic_year_id
      and classroom.status = 'active'
  ) then
    raise exception 'Choose an active class in this campus and academic year.' using errcode = '22023';
  end if;
  if p_staff_id is distinct from entry_row.staff_id and p_staff_id is not null and not exists (
    select 1
    from public.education_staff staff
    where staff.org_id = p_org_id
      and staff.branch_id = entry_row.branch_id
      and staff.id = p_staff_id
      and staff.status = 'active'
  ) then
    raise exception 'Choose an active staff member at this campus.' using errcode = '22023';
  end if;

  if entry_row.weekday < p_weekday then
    perform pg_advisory_xact_lock(
      hashtext(p_org_id::text), hashtext(entry_row.branch_id::text || entry_row.weekday::text)
    );
    if entry_row.weekday <> p_weekday then
      perform pg_advisory_xact_lock(
        hashtext(p_org_id::text), hashtext(entry_row.branch_id::text || p_weekday::text)
      );
    end if;
  elsif entry_row.weekday > p_weekday then
    perform pg_advisory_xact_lock(
      hashtext(p_org_id::text), hashtext(entry_row.branch_id::text || p_weekday::text)
    );
    perform pg_advisory_xact_lock(
      hashtext(p_org_id::text), hashtext(entry_row.branch_id::text || entry_row.weekday::text)
    );
  else
    perform pg_advisory_xact_lock(
      hashtext(p_org_id::text), hashtext(entry_row.branch_id::text || p_weekday::text)
    );
  end if;

  if exists (
    select 1
    from public.education_timetable_entries other_entry
    where other_entry.org_id = p_org_id
      and other_entry.branch_id = entry_row.branch_id
      and other_entry.academic_year_id = entry_row.academic_year_id
      and other_entry.weekday = p_weekday
      and other_entry.status = 'active'
      and other_entry.id <> entry_row.id
      and other_entry.starts_at < p_ends_at
      and other_entry.ends_at > p_starts_at
      and (
        other_entry.class_id = p_class_id
        or (p_staff_id is not null and other_entry.staff_id = p_staff_id)
        or (nullif(btrim(p_room), '') is not null and lower(other_entry.room) = lower(btrim(p_room)))
      )
  ) then
    raise exception 'The class, staff member, or room already has a timetable entry during that time.'
      using errcode = '23P01';
  end if;

  update public.education_timetable_entries
  set class_id = p_class_id,
      staff_id = p_staff_id,
      weekday = p_weekday,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      room = nullif(btrim(p_room), ''),
      updated_at = now()
  where org_id = p_org_id and id = p_entry_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_timetable_entry_updated', 'education_timetable_entry', p_entry_id,
    jsonb_build_object(
      'branch_id', entry_row.branch_id,
      'previous_weekday', entry_row.weekday,
      'weekday', p_weekday,
      'previous_starts_at', entry_row.starts_at,
      'starts_at', p_starts_at,
      'previous_ends_at', entry_row.ends_at,
      'ends_at', p_ends_at,
      'class_id', p_class_id,
      'staff_id', p_staff_id
    )
  );
  return true;
end;
$$;

create or replace function public.education_cancel_timetable_entry(
  p_org_id uuid,
  p_entry_id uuid,
  p_expected_updated_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row public.education_timetable_entries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to cancel timetable entries.' using errcode = '42501';
  end if;
  select * into entry_row
  from public.education_timetable_entries
  where org_id = p_org_id and id = p_entry_id
  for update;
  if not found then
    raise exception 'The timetable entry was not found.' using errcode = 'P0002';
  end if;
  if entry_row.status <> 'active'
    or entry_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This timetable entry is no longer active or has changed. Refresh and try again.'
      using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
    p_org_id, entry_row.branch_id, 'education_timetables', 'edit'
  ) then
    raise exception 'You are not authorized to cancel this timetable entry.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_org_id::text), hashtext(entry_row.branch_id::text || entry_row.weekday::text)
  );
  update public.education_timetable_entries
  set status = 'cancelled', updated_at = now()
  where org_id = p_org_id and id = p_entry_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_timetable_entry_cancelled', 'education_timetable_entry', p_entry_id,
    jsonb_build_object(
      'branch_id', entry_row.branch_id,
      'class_id', entry_row.class_id,
      'weekday', entry_row.weekday,
      'starts_at', entry_row.starts_at,
      'ends_at', entry_row.ends_at
    )
  );
  return true;
end;
$$;

revoke all on function public.education_update_timetable_entry(uuid, uuid, timestamptz, uuid, uuid, smallint, time, time, text) from public, anon;
grant execute on function public.education_update_timetable_entry(uuid, uuid, timestamptz, uuid, uuid, smallint, time, time, text) to authenticated;
revoke all on function public.education_cancel_timetable_entry(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.education_cancel_timetable_entry(uuid, uuid, timestamptz) to authenticated;

commit;
