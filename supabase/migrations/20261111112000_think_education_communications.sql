begin;

create table if not exists public.education_communications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  audience text not null check (audience in ('all', 'guardians', 'students', 'staff')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  published_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  check ((status = 'published' and published_by is not null and published_at is not null)
    or (status <> 'published' and published_by is null and published_at is null))
);

create index if not exists education_communications_campus_status_idx
  on public.education_communications (org_id, branch_id, status, created_at desc);
create index if not exists education_communications_portal_idx
  on public.education_communications (org_id, branch_id, audience, published_at desc)
  where status = 'published';

alter table public.education_communications enable row level security;

create policy "education communications read"
  on public.education_communications for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_communication', 'view'));

create or replace function public.education_communication_create_draft(
  p_org_id uuid,
  p_branch_id uuid,
  p_title text,
  p_body text,
  p_audience text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  communication_id uuid;
begin
  if auth.uid() is null
    or p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_body is null or char_length(btrim(p_body)) not between 1 and 5000
    or p_audience is null or p_audience not in ('all', 'guardians', 'students', 'staff') then
    raise exception 'Announcement details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_communication', 'create') then
    raise exception 'You are not authorized to create announcements at this campus.' using errcode = '42501';
  end if;

  insert into public.education_communications (
    org_id, branch_id, title, body, audience, created_by
  ) values (
    p_org_id, p_branch_id, btrim(p_title), btrim(p_body), p_audience, auth.uid()
  ) returning id into communication_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_communication_draft_created', 'education_communication', communication_id,
    jsonb_build_object('branch_id', p_branch_id, 'audience', p_audience, 'title', btrim(p_title))
  );
  return communication_id;
end;
$$;

create or replace function public.education_communication_publish(
  p_org_id uuid,
  p_communication_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  communication_row public.education_communications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to publish an announcement.' using errcode = '42501';
  end if;
  select * into communication_row
  from public.education_communications
  where org_id = p_org_id and id = p_communication_id
  for update;
  if not found then
    raise exception 'The announcement was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, communication_row.branch_id, 'education_communication', 'publish') then
    raise exception 'You are not authorized to publish announcements at this campus.' using errcode = '42501';
  end if;
  if communication_row.status <> 'draft' then
    raise exception 'Only a draft announcement can be published.' using errcode = '22023';
  end if;

  update public.education_communications
  set status = 'published', published_by = auth.uid(), published_at = now(), updated_at = now()
  where org_id = p_org_id and id = p_communication_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_communication_published', 'education_communication', p_communication_id,
    jsonb_build_object('branch_id', communication_row.branch_id, 'audience', communication_row.audience, 'title', communication_row.title)
  );
  return true;
end;
$$;

create or replace function public.education_communication_archive(
  p_org_id uuid,
  p_communication_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  communication_row public.education_communications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to archive an announcement.' using errcode = '42501';
  end if;
  select * into communication_row
  from public.education_communications
  where org_id = p_org_id and id = p_communication_id
  for update;
  if not found then
    raise exception 'The announcement was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, communication_row.branch_id, 'education_communication', 'edit') then
    raise exception 'You are not authorized to archive announcements at this campus.' using errcode = '42501';
  end if;
  if communication_row.status = 'archived' then
    raise exception 'This announcement has already been archived.' using errcode = '22023';
  end if;

  update public.education_communications
  set status = 'archived', published_by = null, published_at = null, updated_at = now()
  where org_id = p_org_id and id = p_communication_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_communication_archived', 'education_communication', p_communication_id,
    jsonb_build_object('branch_id', communication_row.branch_id, 'previous_status', communication_row.status, 'audience', communication_row.audience, 'title', communication_row.title)
  );
  return true;
end;
$$;

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

revoke all on function public.education_communication_create_draft(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.education_communication_create_draft(uuid, uuid, text, text, text) to authenticated;
revoke all on function public.education_communication_publish(uuid, uuid) from public, anon;
grant execute on function public.education_communication_publish(uuid, uuid) to authenticated;
revoke all on function public.education_communication_archive(uuid, uuid) from public, anon;
grant execute on function public.education_communication_archive(uuid, uuid) to authenticated;
revoke all on function public.education_get_guardian_communications() from public, anon;
grant execute on function public.education_get_guardian_communications() to authenticated;
revoke all on function public.education_get_student_communications() from public, anon;
grant execute on function public.education_get_student_communications() to authenticated;

grant select on public.education_communications to authenticated;
revoke insert, update, delete on public.education_communications from authenticated;
revoke all on public.education_communications from anon;

commit;
