begin;

create or replace function public.education_current_guardian_can_access_student(
  p_org_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.education_guardians guardian
    join public.education_student_guardians relationship
      on relationship.org_id = guardian.org_id
      and relationship.guardian_id = guardian.id
      and relationship.status = 'verified'
    join public.education_students student
      on student.org_id = relationship.org_id
      and student.branch_id = relationship.branch_id
      and student.id = relationship.student_id
      and student.status = 'active'
    join public.organizations organization
      on organization.id = guardian.org_id
      and organization.registration_status = 'approved'
    where guardian.org_id = p_org_id
      and guardian.user_id = auth.uid()
      and guardian.status = 'active'
      and student.id = p_student_id
      and public.has_product_access(guardian.org_id, 'think-education', false)
  );
$$;

revoke all on function public.education_current_guardian_can_access_student(uuid, uuid)
  from public, anon;
grant execute on function public.education_current_guardian_can_access_student(uuid, uuid)
  to authenticated;

drop policy if exists "education assignments authorized reads"
  on public.education_assignments;
create policy "education assignments authorized reads"
  on public.education_assignments for select to authenticated
  using (
    public.education_current_teacher_can_access_class(org_id, class_id)
    or (
      status = 'published'
      and exists (
        select 1
        from public.education_assignment_targets target
        where target.org_id = education_assignments.org_id
          and target.assignment_id = education_assignments.id
          and (
            public.education_current_student_can_access(target.org_id, target.student_id)
            or public.education_current_guardian_can_access_student(target.org_id, target.student_id)
          )
      )
    )
  );

drop policy if exists "education assignment targets authorized reads"
  on public.education_assignment_targets;
create policy "education assignment targets authorized reads"
  on public.education_assignment_targets for select to authenticated
  using (
    public.education_current_student_can_access(org_id, student_id)
    or public.education_current_guardian_can_access_student(org_id, student_id)
    or exists (
      select 1
      from public.education_assignments assignment
      where assignment.org_id = education_assignment_targets.org_id
        and assignment.id = education_assignment_targets.assignment_id
        and public.education_current_teacher_can_access_class(assignment.org_id, assignment.class_id)
    )
  );

drop policy if exists "education assignment submissions authorized reads"
  on public.education_assignment_submissions;
create policy "education assignment submissions authorized reads"
  on public.education_assignment_submissions for select to authenticated
  using (
    public.education_current_student_can_access(org_id, student_id)
    or public.education_current_guardian_can_access_student(org_id, student_id)
    or exists (
      select 1
      from public.education_assignments assignment
      where assignment.org_id = education_assignment_submissions.org_id
        and assignment.id = education_assignment_submissions.assignment_id
        and public.education_current_teacher_can_access_class(assignment.org_id, assignment.class_id)
    )
  );

commit;
