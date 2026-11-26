begin;

create or replace function public.education_guard_timetable_class_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_subject_id uuid;
begin
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id then
    return new;
  end if;

  if new.subject_id is null then
    select subject.id into resolved_subject_id
    from public.education_subjects subject
    where subject.org_id = new.org_id
      and subject.name = new.subject_name
      and subject.status = 'active';
  else
    resolved_subject_id := new.subject_id;
  end if;

  if resolved_subject_id is null or not exists (
    select 1
    from public.education_class_subjects assignment
    where assignment.org_id = new.org_id
      and assignment.branch_id = new.branch_id
      and assignment.class_id = new.class_id
      and assignment.subject_id = resolved_subject_id
      and assignment.status = 'active'
  ) then
    raise exception 'The selected subject is not actively assigned to this class.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.education_guard_timetable_class_subject()
  from public, anon, authenticated;

commit;
