begin;

alter table public.education_communications
  add column if not exists event_starts_at timestamptz,
  add column if not exists event_ends_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'education_communications_event_window_check'
      and conrelid = 'public.education_communications'::regclass
  ) then
    alter table public.education_communications
      add constraint education_communications_event_window_check
      check (
        (event_starts_at is null and event_ends_at is null)
        or (event_starts_at is not null and event_ends_at is not null and event_ends_at >= event_starts_at)
      );
  end if;
end;
$$;

create index if not exists education_communications_guardian_event_idx
  on public.education_communications (org_id, branch_id, event_starts_at)
  where status = 'published' and event_starts_at is not null;

create or replace function public.education_communication_create_event_draft(
  p_org_id uuid,
  p_branch_id uuid,
  p_title text,
  p_body text,
  p_audience text,
  p_event_starts_at timestamptz,
  p_event_ends_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  communication_id uuid;
begin
  if auth.uid() is null
    or p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_body is null or char_length(btrim(p_body)) not between 1 and 5000
    or p_audience is null or p_audience not in ('all', 'guardians')
    or p_event_starts_at is null or p_event_ends_at is null
    or p_event_ends_at < p_event_starts_at
    or p_event_starts_at < now() - interval '30 days'
    or p_event_starts_at > now() + interval '2 years' then
    raise exception 'School event details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(
    p_org_id, p_branch_id, 'education_communication', 'create'
  ) then
    raise exception 'You are not authorized to create events at this campus.' using errcode = '42501';
  end if;

  insert into public.education_communications (
    org_id, branch_id, title, body, audience, event_starts_at, event_ends_at, created_by
  ) values (
    p_org_id, p_branch_id, btrim(p_title), btrim(p_body), p_audience,
    p_event_starts_at, p_event_ends_at, auth.uid()
  ) returning id into communication_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_event_draft_created', 'education_communication', communication_id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'audience', p_audience,
      'event_starts_at', p_event_starts_at,
      'event_ends_at', p_event_ends_at
    )
  );
  return communication_id;
end;
$$;

create or replace function public.education_get_guardian_schedule(
  p_student_ids uuid[]
) returns table (
  org_id uuid,
  student_id uuid,
  item_type text,
  item_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  detail text,
  campus_name text,
  status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or p_student_ids is null
    or cardinality(p_student_ids) not between 1 and 100
    or array_position(p_student_ids, null) is not null
    or cardinality(p_student_ids) <> (
      select count(distinct requested.id)
      from unnest(p_student_ids) as requested(id)
    ) then
    raise exception 'Guardian schedule request is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_student_ids) as requested(id)
    left join public.education_students student on student.id = requested.id
    where student.id is null
      or not public.education_current_guardian_can_access_student(student.org_id, student.id)
  ) then
    raise exception 'One or more students are not linked to this guardian account.' using errcode = '42501';
  end if;

  return query
  select
    student.org_id,
    student.id,
    'examination'::text,
    examination.id,
    examination.name,
    examination.starts_at,
    examination.ends_at,
    examination.examination_type,
    location.name,
    examination.status
  from unnest(p_student_ids) as requested(id)
  join public.education_students student on student.id = requested.id
  join public.education_examinations examination
    on examination.org_id = student.org_id
    and examination.branch_id = student.branch_id
    and examination.status in ('scheduled', 'in_progress')
    and examination.starts_at between now() - interval '30 days' and now() + interval '365 days'
  join public.business_locations location
    on location.org_id = student.org_id and location.id = student.branch_id

  union all

  select
    student.org_id,
    student.id,
    'event'::text,
    communication.id,
    communication.title,
    communication.event_starts_at,
    communication.event_ends_at,
    communication.body,
    location.name,
    'published'::text
  from unnest(p_student_ids) as requested(id)
  join public.education_students student on student.id = requested.id
  join public.education_communications communication
    on communication.org_id = student.org_id
    and communication.branch_id = student.branch_id
    and communication.status = 'published'
    and communication.audience in ('all', 'guardians')
    and communication.event_starts_at between now() - interval '30 days' and now() + interval '365 days'
  join public.business_locations location
    on location.org_id = student.org_id and location.id = student.branch_id
  order by starts_at, title, student_id;
end;
$$;

create or replace function public.education_get_guardian_contact_profiles()
returns table (
  org_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select guardian.org_id, guardian.first_name, guardian.last_name, guardian.email, guardian.phone
  from public.education_guardians guardian
  join public.organizations organization
    on organization.id = guardian.org_id
    and organization.registration_status = 'approved'
  where guardian.user_id = auth.uid()
    and guardian.status = 'active'
    and public.has_product_access(guardian.org_id, 'think-education', false)
    and exists (
      select 1
      from public.education_student_guardians relationship
      join public.education_students student
        on student.org_id = relationship.org_id
        and student.branch_id = relationship.branch_id
        and student.id = relationship.student_id
        and student.status = 'active'
      where relationship.org_id = guardian.org_id
        and relationship.guardian_id = guardian.id
        and relationship.status = 'verified'
    )
  order by organization.name, guardian.id;
$$;

create or replace function public.education_guardian_update_own_contact(
  p_org_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  guardian_id uuid;
begin
  if auth.uid() is null
    or p_first_name is null or char_length(btrim(p_first_name)) not between 1 and 100
    or p_last_name is null or char_length(btrim(p_last_name)) not between 1 and 100
    or char_length(coalesce(p_email, '')) > 254
    or (nullif(btrim(p_email), '') is not null
      and btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or char_length(coalesce(p_phone, '')) > 40 then
    raise exception 'Guardian contact details are invalid.' using errcode = '22023';
  end if;

  select guardian.id into guardian_id
  from public.education_guardians guardian
  where guardian.org_id = p_org_id
    and guardian.user_id = auth.uid()
    and guardian.status = 'active'
    and public.has_product_access(guardian.org_id, 'think-education', false)
    and exists (
      select 1
      from public.organizations organization
      where organization.id = guardian.org_id
        and organization.registration_status = 'approved'
    )
    and exists (
      select 1
      from public.education_student_guardians relationship
      join public.education_students student
        on student.org_id = relationship.org_id
        and student.branch_id = relationship.branch_id
        and student.id = relationship.student_id
        and student.status = 'active'
      where relationship.org_id = guardian.org_id
        and relationship.guardian_id = guardian.id
        and relationship.status = 'verified'
    )
  for update;
  if guardian_id is null then
    raise exception 'An active linked guardian profile was not found.' using errcode = '42501';
  end if;

  update public.education_guardians
  set first_name = btrim(p_first_name),
      last_name = btrim(p_last_name),
      email = nullif(lower(btrim(p_email)), ''),
      phone = nullif(btrim(p_phone), ''),
      updated_at = now()
  where org_id = p_org_id and id = guardian_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'guardian_contact_updated', 'education_guardian', guardian_id,
    jsonb_build_object('fields', array['first_name', 'last_name', 'email', 'phone'])
  );
  return true;
end;
$$;

revoke all on function public.education_communication_create_event_draft(uuid, uuid, text, text, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.education_communication_create_event_draft(uuid, uuid, text, text, text, timestamptz, timestamptz)
  to authenticated;
revoke all on function public.education_get_guardian_schedule(uuid[]) from public, anon;
grant execute on function public.education_get_guardian_schedule(uuid[]) to authenticated;
revoke all on function public.education_get_guardian_contact_profiles() from public, anon;
grant execute on function public.education_get_guardian_contact_profiles() to authenticated;
revoke all on function public.education_guardian_update_own_contact(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.education_guardian_update_own_contact(uuid, text, text, text, text)
  to authenticated;

commit;
