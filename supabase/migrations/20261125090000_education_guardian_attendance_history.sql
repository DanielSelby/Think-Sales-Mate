begin;

create or replace function public.education_get_guardian_attendance_history(
  p_student_ids uuid[],
  p_limit_per_student integer default 30
)
returns table (
  record_id uuid,
  student_id uuid,
  attendance_date date,
  status text,
  record_type text,
  detail text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or p_student_ids is null
    or cardinality(p_student_ids) not between 1 and 100
    or array_position(p_student_ids, null) is not null
    or cardinality(p_student_ids) <> (
      select count(distinct requested.id)
      from unnest(p_student_ids) as requested(id)
    )
    or p_limit_per_student is null
    or p_limit_per_student not between 1 and 60 then
    raise exception 'Attendance history request is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_student_ids) as requested(id)
    left join public.education_students student on student.id = requested.id
    where student.id is null
      or not public.education_current_guardian_can_access_student(student.org_id, student.id)
  ) then
    raise exception 'One or more students are not linked to your verified guardian profile.' using errcode = '42501';
  end if;

  return query
  with requested_students as (
    select student.org_id, student.branch_id, student.id
    from public.education_students student
    where student.id = any(p_student_ids)
  ),
  attendance_rows as (
    select
      daily.id as record_id,
      daily.student_id,
      daily.attendance_date,
      daily.status,
      'Daily'::text as record_type,
      left(coalesce(classroom.name, 'Daily attendance'), 120) as detail,
      daily.created_at
    from requested_students requested
    join public.education_attendance daily
      on daily.org_id = requested.org_id
      and daily.branch_id = requested.branch_id
      and daily.student_id = requested.id
    left join public.education_classes classroom
      on classroom.org_id = daily.org_id
      and classroom.branch_id = daily.branch_id
      and classroom.id = daily.class_id
    where daily.attendance_date between current_date - 89 and current_date

    union all

    select
      lesson.id as record_id,
      lesson.student_id,
      lesson.attendance_date,
      lesson.status,
      'Lesson'::text as record_type,
      left(timetable.subject_name, 120) as detail,
      lesson.created_at
    from requested_students requested
    join public.education_lesson_attendance lesson
      on lesson.org_id = requested.org_id
      and lesson.branch_id = requested.branch_id
      and lesson.student_id = requested.id
    join public.education_timetable_entries timetable
      on timetable.org_id = lesson.org_id
      and timetable.branch_id = lesson.branch_id
      and timetable.id = lesson.timetable_entry_id
    where lesson.attendance_date between current_date - 89 and current_date
  ),
  ranked_attendance as (
    select
      attendance_rows.*,
      row_number() over (
        partition by attendance_rows.student_id
        order by attendance_rows.attendance_date desc, attendance_rows.created_at desc, attendance_rows.record_type
      ) as row_number
    from attendance_rows
  )
  select
    ranked_attendance.record_id,
    ranked_attendance.student_id,
    ranked_attendance.attendance_date,
    ranked_attendance.status,
    ranked_attendance.record_type,
    ranked_attendance.detail
  from ranked_attendance
  where ranked_attendance.row_number <= p_limit_per_student
  order by ranked_attendance.student_id, ranked_attendance.attendance_date desc, ranked_attendance.created_at desc;
end;
$$;

revoke all on function public.education_get_guardian_attendance_history(uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.education_get_guardian_attendance_history(uuid[], integer)
  to authenticated;

commit;
