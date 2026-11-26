create index if not exists education_attendance_date_range_report_idx
  on public.education_attendance (org_id, branch_id, attendance_date, student_id);

create index if not exists education_student_enrollments_date_range_report_idx
  on public.education_student_enrollments (org_id, class_id, branch_id, enrolled_on, ended_on);

create or replace function public.education_get_attendance_report_page(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_from date,
  p_to date,
  p_search text,
  p_class_id uuid,
  p_status text,
  p_page_size integer,
  p_offset integer
)
returns table (
  attendance_rows jsonb,
  status_counts jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $function$
  with matched_rows as materialized (
    select
      attendance.id as attendance_id,
      attendance.student_id,
      student.student_number,
      student.first_name,
      student.other_names,
      student.last_name,
      attendance.branch_id,
      attendance.attendance_date,
      attendance.status,
      attendance.note
    from public.education_attendance attendance
    join public.education_students student
      on student.id = attendance.student_id
      and student.org_id = attendance.org_id
    where attendance.org_id = p_org_id
      and attendance.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
      and attendance.attendance_date between p_from and p_to
      and (
        coalesce(p_search, '') = ''
        or student.student_number ilike ('%' || p_search || '%')
        or student.first_name ilike ('%' || p_search || '%')
        or coalesce(student.other_names, '') ilike ('%' || p_search || '%')
        or student.last_name ilike ('%' || p_search || '%')
      )
      and (
        p_class_id is null
        or exists (
          select 1
          from public.education_student_enrollments enrollment
          where enrollment.org_id = attendance.org_id
            and enrollment.branch_id = attendance.branch_id
            and enrollment.student_id = attendance.student_id
            and enrollment.class_id = p_class_id
            and enrollment.enrolled_on <= attendance.attendance_date
            and (
              (enrollment.status = 'active' and enrollment.ended_on is null)
              or enrollment.ended_on >= attendance.attendance_date
            )
        )
      )
  ),
  filtered_rows as (
    select *
    from matched_rows
    where p_status = 'all' or status = p_status
  ),
  counts as (
    select jsonb_object_agg(status_list.status, coalesce(status_totals.row_count, 0)) as status_counts
    from (values
      ('present'),
      ('absent'),
      ('late'),
      ('excused')
    ) as status_list(status)
    left join (
      select status, count(*) as row_count
      from matched_rows
      group by status
    ) status_totals on status_totals.status = status_list.status
  ),
  page_rows as (
    select *
    from filtered_rows
    order by attendance_date desc, last_name, first_name, student_id, attendance_id
    limit greatest(1, least(coalesce(p_page_size, 25), 500))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(page_rows)
          order by page_rows.attendance_date desc, page_rows.last_name, page_rows.first_name, page_rows.student_id, page_rows.attendance_id
        )
        from page_rows
      ),
      '[]'::jsonb
    ),
    counts.status_counts,
    (select count(*) from filtered_rows)
  from counts;
$function$;

revoke all on function public.education_get_attendance_report_page(uuid, uuid[], date, date, text, uuid, text, integer, integer) from public, anon;
grant execute on function public.education_get_attendance_report_page(uuid, uuid[], date, date, text, uuid, text, integer, integer) to authenticated;
