begin;

create or replace function public.education_enroll_student_in_class(
  p_org_id uuid,
  p_student_id uuid,
  p_class_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  student_row public.education_students%rowtype;
  class_row public.education_classes%rowtype;
  year_status text;
  active_enrollment_exists boolean;
  enrolled_count integer;
  enrollment_id uuid;
begin
  select * into student_row
  from public.education_students
  where org_id = p_org_id and id = p_student_id
  for update;
  if not found then
    raise exception 'The student was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, student_row.branch_id, 'education_students', 'edit'
  ) then
    raise exception 'You are not authorized to enroll students at this campus.'
      using errcode = '42501';
  end if;
  if student_row.status <> 'active' then
    raise exception 'Only active students can be enrolled in a class.'
      using errcode = '22023';
  end if;
  select exists (
    select 1 from public.education_student_enrollments
    where org_id = p_org_id and student_id = p_student_id and status = 'active'
  ) into active_enrollment_exists;
  if active_enrollment_exists then
    raise exception 'The student already has an active class enrollment.'
      using errcode = '22023';
  end if;

  select * into class_row
  from public.education_classes
  where org_id = p_org_id and id = p_class_id
  for update;
  if not found or class_row.branch_id <> student_row.branch_id then
    raise exception 'Select an active class at the student''s campus.'
      using errcode = 'P0002';
  end if;
  if class_row.status <> 'active' then
    raise exception 'Students can only be enrolled in active classes.'
      using errcode = '22023';
  end if;

  select status into year_status
  from public.education_academic_years
  where org_id = p_org_id and id = class_row.academic_year_id;
  if year_status is distinct from 'active' then
    raise exception 'Initial class enrollment is available only for the active academic year.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.education_student_enrollments
    where org_id = p_org_id and student_id = p_student_id
      and academic_year_id = class_row.academic_year_id
  ) then
    raise exception 'The student already has an enrollment record for this academic year.'
      using errcode = '23505';
  end if;

  if class_row.capacity is not null then
    select count(*) into enrolled_count
    from public.education_student_enrollments
    where org_id = p_org_id and class_id = class_row.id and status = 'active';
    if enrolled_count >= class_row.capacity then
      raise exception 'The selected class has reached its enrollment capacity.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.education_student_enrollments (
    org_id, branch_id, student_id, class_id, academic_year_id, status, enrolled_on
  ) values (
    p_org_id, student_row.branch_id, student_row.id, class_row.id,
    class_row.academic_year_id, 'active', current_date
  )
  returning id into enrollment_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'student_class_enrolled', 'education_student_enrollment',
    enrollment_id, jsonb_build_object(
      'branch_id', student_row.branch_id,
      'student_id', student_row.id,
      'class_id', class_row.id,
      'academic_year_id', class_row.academic_year_id
    )
  );
  return enrollment_id;
end;
$$;

revoke all on function public.education_enroll_student_in_class(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.education_enroll_student_in_class(uuid, uuid, uuid)
  to authenticated;

commit;
