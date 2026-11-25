begin;

create or replace function public.education_current_user_can_access_assignment(
  p_org_id uuid,
  p_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.education_assignments assignment
    join public.education_assignment_targets target
      on target.org_id = assignment.org_id
      and target.assignment_id = assignment.id
    where assignment.org_id = p_org_id
      and assignment.id = p_assignment_id
      and assignment.status = 'published'
      and (
        public.education_current_student_can_access(target.org_id, target.student_id)
        or public.education_current_guardian_can_access_student(target.org_id, target.student_id)
      )
  );
$$;

revoke all on function public.education_current_user_can_access_assignment(uuid, uuid)
  from public, anon;
grant execute on function public.education_current_user_can_access_assignment(uuid, uuid)
  to authenticated;

drop policy if exists "education assignments authorized reads"
  on public.education_assignments;
create policy "education assignments authorized reads"
  on public.education_assignments for select to authenticated
  using (
    public.education_current_teacher_can_access_class(org_id, class_id)
    or public.education_current_user_can_access_assignment(org_id, id)
  );

commit;
