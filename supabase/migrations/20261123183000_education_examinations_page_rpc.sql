begin;

create or replace function public.education_get_examinations_page(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_branch_id uuid,
  p_academic_year_id uuid,
  p_status text,
  p_search text,
  p_limit integer,
  p_offset integer
) returns table (
  id uuid,
  branch_id uuid,
  academic_year_id uuid,
  term_id uuid,
  name text,
  examination_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  academic_year_name text,
  term_name text,
  campus_name text,
  total_count bigint,
  scheduled_count bigint,
  in_progress_count bigint,
  results_pending_count bigint
)
language sql
stable
set search_path = public
as $$
  with authorized_examinations as (
    select
      exam.id,
      exam.branch_id,
      exam.academic_year_id,
      exam.term_id,
      exam.name,
      exam.examination_type,
      exam.starts_at,
      exam.ends_at,
      exam.status,
      academic_year.name as academic_year_name,
      term.name as term_name,
      location.name as campus_name
    from public.education_examinations exam
    left join public.education_academic_years academic_year
      on academic_year.org_id = exam.org_id
      and academic_year.id = exam.academic_year_id
    left join public.education_academic_terms term
      on term.org_id = exam.org_id
      and term.id = exam.term_id
    left join public.business_locations location
      on location.org_id = exam.org_id
      and location.id = exam.branch_id
    where exam.org_id = p_org_id
      and exam.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and (p_branch_id is null or exam.branch_id = p_branch_id)
      and (p_academic_year_id is null or exam.academic_year_id = p_academic_year_id)
      and (p_status is null or exam.status = p_status)
      and public.education_can_access_branch(
        p_org_id, exam.branch_id, 'education_examinations', 'view'
      )
  ),
  filtered_examinations as (
    select *
    from authorized_examinations exam
    where nullif(trim(p_search), '') is null
      or exam.name ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      or exam.examination_type ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      or coalesce(exam.academic_year_name, '') ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      or coalesce(exam.campus_name, '') ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      or coalesce(exam.term_name, '') ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
  ),
  filtered_counts as (
    select
      count(*)::bigint as total_count,
      count(*) filter (where exam.status = 'scheduled')::bigint as scheduled_count,
      count(*) filter (where exam.status = 'in_progress')::bigint as in_progress_count,
      count(*) filter (where exam.status = 'results_pending')::bigint as results_pending_count
    from filtered_examinations exam
  ),
  page_examinations as (
    select *
    from filtered_examinations
    order by starts_at desc, id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    page_examinations.id,
    page_examinations.branch_id,
    page_examinations.academic_year_id,
    page_examinations.term_id,
    page_examinations.name,
    page_examinations.examination_type,
    page_examinations.starts_at,
    page_examinations.ends_at,
    page_examinations.status,
    page_examinations.academic_year_name,
    page_examinations.term_name,
    page_examinations.campus_name,
    filtered_counts.total_count,
    filtered_counts.scheduled_count,
    filtered_counts.in_progress_count,
    filtered_counts.results_pending_count
  from page_examinations
  cross join filtered_counts;
$$;

revoke all on function public.education_get_examinations_page(
  uuid, uuid[], uuid, uuid, text, text, integer, integer
) from public, anon;
grant execute on function public.education_get_examinations_page(
  uuid, uuid[], uuid, uuid, text, text, integer, integer
) to authenticated;

commit;
