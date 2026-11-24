begin;

create or replace function public.education_get_examination_results_page(
  p_org_id uuid,
  p_examination_id uuid,
  p_branch_ids uuid[],
  p_status text,
  p_search text,
  p_limit integer,
  p_offset integer
) returns table (
  id uuid,
  student_id uuid,
  subject_id uuid,
  subject_name text,
  score numeric,
  maximum_score numeric,
  grade text,
  grade_override text,
  status text,
  student_number text,
  first_name text,
  last_name text,
  total_count bigint,
  draft_count bigint,
  submitted_count bigint,
  approved_count bigint,
  published_count bigint,
  locked_subject_ids uuid[]
)
language sql
stable
set search_path = public
as $$
  with authorized_exam as (
    select exam.id, exam.branch_id
    from public.education_examinations exam
    where exam.org_id = p_org_id
      and exam.id = p_examination_id
      and exam.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and public.education_can_access_branch(
        p_org_id, exam.branch_id, 'education_results', 'view'
      )
  ),
  all_results as (
    select result.*
    from public.education_results result
    join authorized_exam exam
      on exam.id = result.examination_id
      and exam.branch_id = result.branch_id
    where result.org_id = p_org_id
  ),
  filtered_results as (
    select
      result.id,
      result.student_id,
      result.subject_id,
      result.subject_name,
      result.score,
      result.maximum_score,
      result.grade,
      result.grade_override,
      result.status,
      student.student_number,
      student.first_name,
      student.last_name
    from all_results result
    left join public.education_students student
      on student.org_id = p_org_id
      and student.id = result.student_id
    where (p_status is null or result.status = p_status)
      and (
        nullif(trim(p_search), '') is null
        or student.student_number ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
        or student.first_name || ' ' || student.last_name ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
        or result.subject_name ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
        or coalesce(result.grade, '') ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
        or result.status ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      )
  ),
  filtered_counts as (
    select count(*)::bigint as total_count
    from filtered_results result
  ),
  overall_status_counts as (
    select
      count(*) filter (where result.status = 'draft')::bigint as draft_count,
      count(*) filter (where result.status = 'submitted')::bigint as submitted_count,
      count(*) filter (where result.status = 'approved')::bigint as approved_count,
      count(*) filter (where result.status = 'published')::bigint as published_count
    from all_results result
  ),
  subject_locks as (
    select coalesce(
      array_agg(distinct result.subject_id) filter (where result.subject_id is not null),
      '{}'::uuid[]
    ) as locked_subject_ids
    from all_results result
  ),
  page_results as (
    select *
    from filtered_results
    order by subject_name, id
    limit least(greatest(coalesce(p_limit, 50), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    page_results.id,
    page_results.student_id,
    page_results.subject_id,
    page_results.subject_name,
    page_results.score,
    page_results.maximum_score,
    page_results.grade,
    page_results.grade_override,
    page_results.status,
    page_results.student_number,
    page_results.first_name,
    page_results.last_name,
    filtered_counts.total_count,
    overall_status_counts.draft_count,
    overall_status_counts.submitted_count,
    overall_status_counts.approved_count,
    overall_status_counts.published_count,
    subject_locks.locked_subject_ids
  from page_results
  cross join filtered_counts
  cross join overall_status_counts
  cross join subject_locks;
$$;

revoke all on function public.education_get_examination_results_page(
  uuid, uuid, uuid[], text, text, integer, integer
) from public, anon;
grant execute on function public.education_get_examination_results_page(
  uuid, uuid, uuid[], text, text, integer, integer
) to authenticated;

commit;
