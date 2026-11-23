begin;

create or replace function public.education_get_student_class_position(
  p_org_id uuid,
  p_student_id uuid
)
returns table (
  student_position integer,
  cohort_size integer,
  examination_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with authorized_student as (
    select student.id, student.branch_id
    from public.education_students student
    where student.org_id = p_org_id
      and student.id = p_student_id
      and public.has_org_permission(p_org_id, 'education_results', 'view')
      and public.can_access_org_location(p_org_id, student.branch_id)
  ),
  placement as (
    select enrollment.class_id, enrollment.academic_year_id
    from public.education_student_enrollments enrollment
    join authorized_student student on student.id = enrollment.student_id
      and student.branch_id = enrollment.branch_id
    where enrollment.org_id = p_org_id
      and enrollment.student_id = p_student_id
      and enrollment.status = 'active'
    order by enrollment.enrolled_on desc
    limit 1
  ),
  latest_exam as (
    select exam.id, exam.name
    from public.education_examinations exam
    join authorized_student student on student.branch_id = exam.branch_id
    join placement on placement.academic_year_id = exam.academic_year_id
    where exam.org_id = p_org_id
      and exam.status = 'published'
    order by coalesce(exam.starts_at, exam.created_at) desc
    limit 1
  ),
  cohort as (
    select enrollment.student_id
    from public.education_student_enrollments enrollment
    join placement on placement.class_id = enrollment.class_id
      and placement.academic_year_id = enrollment.academic_year_id
    join authorized_student student on student.branch_id = enrollment.branch_id
    where enrollment.org_id = p_org_id
      and enrollment.status = 'active'
  ),
  totals as (
    select result.student_id,
      sum(result.score)::numeric as score,
      sum(result.maximum_score)::numeric as maximum_score
    from public.education_results result
    join cohort on cohort.student_id = result.student_id
    join latest_exam exam on exam.id = result.examination_id
    where result.org_id = p_org_id
      and result.status = 'published'
      and result.maximum_score > 0
    group by result.student_id
  ),
  ranked as (
    select totals.student_id,
      row_number() over (order by totals.score / nullif(totals.maximum_score, 0) desc, totals.student_id)::integer as student_position,
      count(*) over ()::integer as cohort_size
    from totals
  )
  select ranked.student_position, ranked.cohort_size, latest_exam.name
  from ranked
  cross join latest_exam
  where ranked.student_id = p_student_id;
$$;

revoke all on function public.education_get_student_class_position(uuid, uuid) from public, anon;
grant execute on function public.education_get_student_class_position(uuid, uuid) to authenticated;

commit;
