begin;

create or replace function public.education_get_guardian_communications()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(announcements) order by announcements."publishedAt" desc), '[]'::jsonb)
  from (
    select
      communication.id,
      communication.org_id as "organizationId",
      organization.name as "organizationName",
      location.name as "campusName",
      student.first_name || ' ' || student.last_name as "studentName",
      communication.title,
      communication.body,
      communication.published_at as "publishedAt"
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
    join public.education_communications communication
      on communication.org_id = student.org_id
      and communication.branch_id = student.branch_id
      and communication.status = 'published'
      and communication.audience in ('all', 'guardians')
    join public.organizations organization
      on organization.id = guardian.org_id and organization.registration_status = 'approved'
    join public.business_locations location
      on location.org_id = student.org_id and location.id = student.branch_id
    where auth.uid() is not null
      and guardian.user_id = auth.uid()
      and guardian.status = 'active'
      and public.has_product_access(guardian.org_id, 'think-education', false)
    order by communication.published_at desc, student.id, communication.id
    limit 100
  ) announcements;
$$;

create or replace function public.education_get_student_communications()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(announcements) order by announcements."publishedAt" desc), '[]'::jsonb)
  from (
    select
      communication.id,
      communication.org_id as "organizationId",
      organization.name as "organizationName",
      location.name as "campusName",
      student.first_name || ' ' || student.last_name as "studentName",
      communication.title,
      communication.body,
      communication.published_at as "publishedAt"
    from public.education_students student
    join public.education_communications communication
      on communication.org_id = student.org_id
      and communication.branch_id = student.branch_id
      and communication.status = 'published'
      and communication.audience in ('all', 'students')
    join public.organizations organization
      on organization.id = student.org_id and organization.registration_status = 'approved'
    join public.business_locations location
      on location.org_id = student.org_id and location.id = student.branch_id
    where auth.uid() is not null
      and student.user_id = auth.uid()
      and student.status = 'active'
      and public.has_product_access(student.org_id, 'think-education', false)
    order by communication.published_at desc
    limit 100
  ) announcements;
$$;

commit;
