begin;

grant update (
  name,
  level_name,
  stream_name,
  class_teacher_id,
  capacity,
  status,
  updated_at
) on public.education_classes to authenticated;

create or replace function public.education_audit_class_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    audit_action := 'education_class_created';
  elsif new.status = 'archived' and old.status <> 'archived' then
    audit_action := 'education_class_archived';
  else
    audit_action := 'education_class_updated';
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    new.org_id,
    auth.uid(),
    audit_action,
    'education_class',
    new.id,
    jsonb_build_object(
      'branch_id', new.branch_id,
      'academic_year_id', new.academic_year_id,
      'class_name', new.name,
      'status', new.status
    )
  );
  return new;
end;
$$;

revoke all on function public.education_audit_class_changes() from public, anon, authenticated;

drop trigger if exists education_classes_audit_changes on public.education_classes;
create trigger education_classes_audit_changes
  after insert or update on public.education_classes
  for each row execute function public.education_audit_class_changes();

create or replace function public.education_get_class_enrollment_counts(
  p_org_id uuid,
  p_class_ids uuid[]
) returns table (class_id uuid, active_count bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null or p_org_id is null or p_class_ids is null
    or cardinality(p_class_ids) > 500
    or not public.education_user_has_any_branch_scope(p_org_id) then
    raise exception 'Class enrollment summary request is invalid or unauthorized.'
      using errcode = '42501';
  end if;

  return query
  select classroom.id, count(enrollment.id)::bigint
  from public.education_classes classroom
  left join public.education_student_enrollments enrollment
    on enrollment.org_id = classroom.org_id
    and enrollment.class_id = classroom.id
    and enrollment.status = 'active'
  where classroom.org_id = p_org_id
    and classroom.id = any(p_class_ids)
    and public.education_can_access_branch(
      classroom.org_id,
      classroom.branch_id,
      'education_academics',
      'view'
    )
  group by classroom.id;
end;
$$;

revoke all on function public.education_get_class_enrollment_counts(uuid, uuid[])
  from public, anon;
grant execute on function public.education_get_class_enrollment_counts(uuid, uuid[])
  to authenticated;

create or replace function public.education_archive_class(
  p_org_id uuid,
  p_class_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  classroom public.education_classes%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_class_id is null then
    raise exception 'Class archive request is invalid.'
      using errcode = '22023';
  end if;

  select * into classroom
  from public.education_classes
  where org_id = p_org_id and id = p_class_id
  for update;
  if not found then
    raise exception 'The class was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id,
    classroom.branch_id,
    'education_academics',
    'delete'
  ) then
    raise exception 'You are not authorized to archive this class.'
      using errcode = '42501';
  end if;

  if classroom.status = 'archived' then
    return classroom.id;
  end if;

  if exists (
    select 1
    from public.education_student_enrollments enrollment
    where enrollment.org_id = p_org_id
      and enrollment.class_id = classroom.id
      and enrollment.status = 'active'
  ) or exists (
    select 1
    from public.education_timetable_entries timetable
    where timetable.org_id = p_org_id
      and timetable.class_id = classroom.id
      and timetable.status = 'active'
  ) then
    raise exception 'The class has active students or timetable entries. Deactivate or transfer those records first.'
      using errcode = '23514';
  end if;

  update public.education_classes
  set status = 'archived',
      updated_at = now()
  where org_id = p_org_id and id = classroom.id;

  return classroom.id;
end;
$$;

revoke all on function public.education_archive_class(uuid, uuid) from public, anon;
grant execute on function public.education_archive_class(uuid, uuid) to authenticated;

commit;
