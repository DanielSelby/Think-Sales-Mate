begin;

create or replace function public.education_get_dashboard_attendance_trend(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_from date,
  p_to date
) returns table (
  attendance_date date,
  total_count bigint,
  present_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    attendance.attendance_date,
    count(*)::bigint as total_count,
    count(*) filter (where attendance.status = 'present')::bigint as present_count
  from public.education_attendance attendance
  where attendance.org_id = p_org_id
    and attendance.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
    and attendance.attendance_date between p_from and p_to
    and public.education_can_access_branch(
      p_org_id, attendance.branch_id, 'education_attendance', 'view'
    )
  group by attendance.attendance_date
  order by attendance.attendance_date;
$$;

create or replace function public.education_get_dashboard_student_distribution(
  p_org_id uuid,
  p_branch_ids uuid[]
) returns table (
  branch_id uuid,
  student_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    student.branch_id,
    count(*)::bigint as student_count
  from public.education_students student
  where student.org_id = p_org_id
    and student.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
    and student.status = 'active'
    and public.education_can_access_branch(
      p_org_id, student.branch_id, 'education_students', 'view'
    )
  group by student.branch_id;
$$;

revoke all on function public.education_get_dashboard_attendance_trend(
  uuid, uuid[], date, date
) from public, anon;
grant execute on function public.education_get_dashboard_attendance_trend(
  uuid, uuid[], date, date
) to authenticated;

revoke all on function public.education_get_dashboard_student_distribution(
  uuid, uuid[]
) from public, anon;
grant execute on function public.education_get_dashboard_student_distribution(
  uuid, uuid[]
) to authenticated;

commit;
