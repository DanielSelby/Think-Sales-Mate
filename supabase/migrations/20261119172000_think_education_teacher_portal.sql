begin;

create unique index if not exists education_staff_org_user_unique_idx
  on public.education_staff (org_id, user_id)
  where user_id is not null;

create or replace function public.education_claim_teacher_account()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  verified_email text;
  verified_at timestamptz;
  staff_row record;
  claimed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Sign in with a verified email address to link your teacher profile.'
      using errcode = '42501';
  end if;

  select lower(btrim(auth_user.email)), auth_user.email_confirmed_at
    into verified_email, verified_at
  from auth.users auth_user
  where auth_user.id = current_user_id;

  if verified_email is null or verified_at is null then
    raise exception 'Verify your email address before linking your teacher profile.'
      using errcode = '42501';
  end if;

  for staff_row in
    select staff.id, staff.org_id
    from public.education_staff staff
    where lower(btrim(staff.email)) = verified_email
      and staff.staff_category = 'teaching'
      and staff.status = 'active'
      and staff.user_id is null
      and public.has_product_access(staff.org_id, 'think-education', false)
      and exists (
        select 1
        from public.organizations organization
        where organization.id = staff.org_id
          and organization.registration_status = 'approved'
      )
    order by staff.org_id, staff.id
    for update of staff
  loop
    update public.education_staff
    set user_id = current_user_id, updated_at = now()
    where org_id = staff_row.org_id
      and id = staff_row.id
      and user_id is null;

    if found then
      insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
      values (
        staff_row.org_id,
        current_user_id,
        'teacher_account_linked',
        'education_staff',
        staff_row.id,
        jsonb_build_object('email_verified', true)
      );
      claimed_count := claimed_count + 1;
    end if;
  end loop;

  return claimed_count;
end;
$$;

create or replace function public.education_get_teacher_portal()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with linked_staff as (
  select
    staff.id,
    staff.org_id,
    staff.branch_id,
    staff.staff_number,
    staff.first_name,
    staff.last_name,
    staff.job_title,
    organization.name as organization_name,
    location.name as campus_name
  from public.education_staff staff
  join public.organizations organization on organization.id = staff.org_id
  join public.business_locations location
    on location.org_id = staff.org_id and location.id = staff.branch_id
  where staff.user_id = auth.uid()
    and staff.staff_category = 'teaching'
    and staff.status = 'active'
    and organization.registration_status = 'approved'
    and public.has_product_access(staff.org_id, 'think-education', false)
),
assigned_classes as (
  select distinct
    staff.org_id,
    staff.id as staff_id,
    class.id,
    class.branch_id,
    class.name,
    class.level_name,
    class.stream_name
  from linked_staff staff
  join public.education_classes class
    on class.org_id = staff.org_id
    and class.branch_id = staff.branch_id
    and class.status = 'active'
  left join public.education_timetable_entries timetable_entry
    on timetable_entry.org_id = class.org_id
    and timetable_entry.branch_id = class.branch_id
    and timetable_entry.class_id = class.id
    and timetable_entry.staff_id = staff.id
    and timetable_entry.status = 'active'
  left join public.education_class_subjects class_subject
    on class_subject.org_id = class.org_id
    and class_subject.branch_id = class.branch_id
    and class_subject.class_id = class.id
    and class_subject.lead_staff_id = staff.id
    and class_subject.status = 'active'
  where class.class_teacher_id = staff.id
    or timetable_entry.id is not null
    or class_subject.id is not null
),
staff_payload as (
  select
    staff.*,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assigned.id,
        'name', assigned.name,
        'levelName', assigned.level_name,
        'streamName', assigned.stream_name,
        'students', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', student.id,
            'studentNumber', student.student_number,
            'firstName', student.first_name,
            'lastName', student.last_name,
            'attendanceStatus', attendance.status
          ) order by student.last_name, student.first_name)
          from public.education_student_enrollments enrollment
          join public.education_students student
            on student.org_id = enrollment.org_id and student.id = enrollment.student_id
          left join public.education_attendance attendance
            on attendance.org_id = enrollment.org_id
            and attendance.branch_id = enrollment.branch_id
            and attendance.class_id = enrollment.class_id
            and attendance.student_id = enrollment.student_id
            and attendance.attendance_date = current_date
          where enrollment.org_id = assigned.org_id
            and enrollment.branch_id = assigned.branch_id
            and enrollment.class_id = assigned.id
            and enrollment.status = 'active'
            and student.status = 'active'
        ), '[]'::jsonb)
      ) order by assigned.name)
      from assigned_classes assigned
      where assigned.org_id = staff.org_id
        and assigned.staff_id = staff.id
    ), '[]'::jsonb) as classes,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'classId', timetable_entry.class_id,
        'className', class.name,
        'subject', timetable_entry.subject_name,
        'weekday', timetable_entry.weekday,
        'startsAt', timetable_entry.starts_at,
        'endsAt', timetable_entry.ends_at,
        'room', timetable_entry.room
      ) order by timetable_entry.weekday, timetable_entry.starts_at)
      from public.education_timetable_entries timetable_entry
      join public.education_classes class
        on class.org_id = timetable_entry.org_id
        and class.branch_id = timetable_entry.branch_id
        and class.id = timetable_entry.class_id
      where timetable_entry.org_id = staff.org_id
        and timetable_entry.branch_id = staff.branch_id
        and timetable_entry.staff_id = staff.id
        and timetable_entry.status = 'active'
    ), '[]'::jsonb) as timetable
  from linked_staff staff
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id', staff.id,
  'organizationId', staff.org_id,
  'organizationName', staff.organization_name,
  'campusName', staff.campus_name,
  'staffNumber', staff.staff_number,
  'firstName', staff.first_name,
  'lastName', staff.last_name,
  'jobTitle', staff.job_title,
  'classes', staff.classes,
  'timetable', staff.timetable
) order by staff.organization_name, staff.last_name, staff.first_name), '[]'::jsonb)
from staff_payload staff;
$$;

create or replace function public.education_teacher_record_student_attendance(
  p_org_id uuid,
  p_class_id uuid,
  p_student_id uuid,
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
  class_row public.education_classes%rowtype;
  attendance_id uuid;
begin
  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = p_org_id
    and staff.user_id = auth.uid()
    and staff.staff_category = 'teaching'
    and staff.status = 'active';
  if not found then
    raise exception 'An active teacher profile is required.' using errcode = '42501';
  end if;
  if p_status not in ('present', 'absent', 'late', 'excused')
    or p_attendance_date is null
    or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Attendance details are invalid.' using errcode = '22023';
  end if;

  select class.* into class_row
  from public.education_classes class
  where class.org_id = p_org_id
    and class.id = p_class_id
    and class.branch_id = staff_row.branch_id
    and class.status = 'active';
  if not found then
    raise exception 'The selected class was not found.' using errcode = 'P0002';
  end if;
  if not (
    class_row.class_teacher_id = staff_row.id
    or exists (
      select 1 from public.education_timetable_entries entry
      where entry.org_id = p_org_id and entry.class_id = p_class_id
        and entry.staff_id = staff_row.id and entry.status = 'active'
    )
    or exists (
      select 1 from public.education_class_subjects assignment
      where assignment.org_id = p_org_id and assignment.class_id = p_class_id
        and assignment.lead_staff_id = staff_row.id and assignment.status = 'active'
    )
  ) then
    raise exception 'You are not assigned to this class.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.education_student_enrollments enrollment
    where enrollment.org_id = p_org_id
      and enrollment.branch_id = staff_row.branch_id
      and enrollment.class_id = p_class_id
      and enrollment.student_id = p_student_id
      and enrollment.status = 'active'
  ) then
    raise exception 'The selected student is not enrolled in this class.' using errcode = 'P0002';
  end if;

  insert into public.education_attendance (
    org_id, branch_id, class_id, student_id, attendance_date, status, note, recorded_by
  ) values (
    p_org_id, staff_row.branch_id, p_class_id, p_student_id, p_attendance_date,
    p_status, nullif(btrim(p_note), ''), auth.uid()
  )
  on conflict (org_id, student_id, attendance_date)
  where student_id is not null
  do update set
    class_id = excluded.class_id,
    status = excluded.status,
    note = excluded.note,
    recorded_by = auth.uid()
  returning id into attendance_id;

  return attendance_id;
end;
$$;

revoke all on function public.education_claim_teacher_account() from public, anon;
grant execute on function public.education_claim_teacher_account() to authenticated;
revoke all on function public.education_get_teacher_portal() from public, anon;
grant execute on function public.education_get_teacher_portal() to authenticated;
revoke all on function public.education_teacher_record_student_attendance(uuid, uuid, uuid, date, text, text) from public, anon;
grant execute on function public.education_teacher_record_student_attendance(uuid, uuid, uuid, date, text, text) to authenticated;

commit;
