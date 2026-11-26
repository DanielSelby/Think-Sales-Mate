create index if not exists education_student_enrollments_directory_class_idx
  on public.education_student_enrollments (org_id, class_id, branch_id, student_id)
  where status = 'active';

create or replace function public.education_student_directory_page(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_search text,
  p_gender text,
  p_class_id uuid,
  p_status text,
  p_page_size integer,
  p_offset integer
)
returns table (
  student_rows jsonb,
  status_counts jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $function$
  with matched_students as materialized (
    select
      student.id,
      student.student_number,
      student.first_name,
      student.last_name,
      student.other_names,
      student.branch_id,
      student.status,
      student.created_at,
      student.photo_path,
      student.gender
    from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and (
        coalesce(p_search, '') = ''
        or student.student_number ilike ('%' || p_search || '%')
        or student.first_name ilike ('%' || p_search || '%')
        or student.last_name ilike ('%' || p_search || '%')
        or coalesce(student.other_names, '') ilike ('%' || p_search || '%')
      )
      and (
        coalesce(p_gender, '') = ''
        or position(lower(p_gender) in lower(coalesce(student.gender, ''))) > 0
      )
      and (
        p_class_id is null
        or exists (
          select 1
          from public.education_student_enrollments enrollment
          where enrollment.org_id = student.org_id
            and enrollment.branch_id = student.branch_id
            and enrollment.student_id = student.id
            and enrollment.class_id = p_class_id
            and enrollment.status = 'active'
        )
      )
  ),
  filtered_students as (
    select *
    from matched_students
    where p_status = 'all' or status = p_status
  ),
  counts as (
    select jsonb_object_agg(status_list.status, coalesce(status_totals.student_count, 0)) as status_counts
    from (values
      ('active'),
      ('on_hold'),
      ('graduated'),
      ('transferred'),
      ('withdrawn'),
      ('archived')
    ) as status_list(status)
    left join (
      select status, count(*) as student_count
      from matched_students
      group by status
    ) status_totals on status_totals.status = status_list.status
  ),
  page_rows as (
    select *
    from filtered_students
    order by last_name, first_name, id
    limit greatest(1, least(coalesce(p_page_size, 10), 500))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(page_rows) || jsonb_build_object(
            'class_names',
            coalesce((
              select jsonb_agg(distinct classroom.name)
              from public.education_student_enrollments enrollment
              join public.education_classes classroom
                on classroom.id = enrollment.class_id
                and classroom.org_id = enrollment.org_id
                and classroom.branch_id = enrollment.branch_id
              where enrollment.org_id = p_org_id
                and enrollment.branch_id = page_rows.branch_id
                and enrollment.student_id = page_rows.id
                and enrollment.status = 'active'
            ), '[]'::jsonb)
          )
          order by page_rows.last_name, page_rows.first_name, page_rows.id
        )
        from page_rows
      ),
      '[]'::jsonb
    ),
    counts.status_counts,
    (select count(*) from filtered_students)
  from counts;
$function$;

revoke all on function public.education_student_directory_page(uuid, uuid[], text, text, uuid, text, integer, integer) from public, anon;
grant execute on function public.education_student_directory_page(uuid, uuid[], text, text, uuid, text, integer, integer) to authenticated;
