begin;

create table if not exists public.education_discipline_incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  class_id uuid,
  staff_id uuid,
  incident_date date not null,
  category text not null check (category in ('misconduct', 'attendance', 'academic', 'bullying', 'safety', 'property', 'other')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  action_taken text,
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'closed')),
  parent_notified boolean not null default false,
  parent_notified_at timestamptz,
  reported_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict,
  check ((parent_notified = true and parent_notified_at is not null)
    or (parent_notified = false and parent_notified_at is null)),
  check ((status in ('resolved', 'closed')) = (resolution_note is not null))
);

create index if not exists education_discipline_student_idx
  on public.education_discipline_incidents (org_id, branch_id, student_id, incident_date desc);
create index if not exists education_discipline_status_idx
  on public.education_discipline_incidents (org_id, branch_id, status, severity, incident_date desc);

alter table public.education_discipline_incidents enable row level security;
revoke all on public.education_discipline_incidents from public, anon, authenticated;

create or replace function public.education_create_discipline_incident(
  p_org_id uuid,
  p_branch_id uuid,
  p_student_id uuid,
  p_class_id uuid,
  p_staff_id uuid,
  p_incident_date date,
  p_category text,
  p_severity text,
  p_title text,
  p_description text,
  p_action_taken text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  incident_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null or p_student_id is null
    or p_incident_date is null
    or p_category not in ('misconduct', 'attendance', 'academic', 'bullying', 'safety', 'property', 'other')
    or p_severity not in ('low', 'medium', 'high', 'critical')
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_description, ''))) not between 1 and 5000
    or char_length(coalesce(p_action_taken, '')) > 5000 then
    raise exception 'Incident details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_discipline', 'create') then
    raise exception 'You do not have permission to record discipline incidents.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.id = p_student_id
  ) then
    raise exception 'The selected student was not found at this campus.' using errcode = 'P0002';
  end if;
  if p_class_id is not null and not exists (
    select 1 from public.education_classes class
    where class.org_id = p_org_id
      and class.branch_id = p_branch_id
      and class.id = p_class_id
  ) then
    raise exception 'The selected class was not found at this campus.' using errcode = 'P0002';
  end if;
  if p_staff_id is not null and not exists (
    select 1 from public.education_staff staff
    where staff.org_id = p_org_id
      and staff.branch_id = p_branch_id
      and staff.id = p_staff_id
  ) then
    raise exception 'The assigned staff member was not found at this campus.' using errcode = 'P0002';
  end if;

  insert into public.education_discipline_incidents (
    org_id, branch_id, student_id, class_id, staff_id,
    incident_date, category, severity, title, description,
    action_taken, status, parent_notified, reported_by, updated_at
  ) values (
    p_org_id, p_branch_id, p_student_id, p_class_id, p_staff_id,
    p_incident_date, p_category, p_severity, btrim(p_title), btrim(p_description),
    nullif(btrim(p_action_taken), ''), 'open', false, auth.uid(), now()
  ) returning id into incident_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_discipline_incident_created',
    'education_discipline_incident', incident_id,
    jsonb_build_object(
      'branch_id', p_branch_id, 'student_id', p_student_id,
      'class_id', p_class_id, 'staff_id', p_staff_id,
      'category', p_category, 'severity', p_severity
    )
  );
  return incident_id;
end;
$$;

revoke all on function public.education_create_discipline_incident(uuid, uuid, uuid, uuid, uuid, date, text, text, text, text, text) from public, anon;
grant execute on function public.education_create_discipline_incident(uuid, uuid, uuid, uuid, uuid, date, text, text, text, text, text) to authenticated;

create or replace function public.education_review_discipline_incident(
  p_org_id uuid,
  p_incident_id uuid,
  p_status text,
  p_resolution_note text,
  p_parent_notified boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  incident public.education_discipline_incidents%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_incident_id is null
    or p_status not in ('open', 'under_review', 'resolved', 'closed')
    or p_parent_notified is null
    or char_length(coalesce(p_resolution_note, '')) > 5000
    or (p_status in ('resolved', 'closed') and char_length(btrim(coalesce(p_resolution_note, ''))) < 1) then
    raise exception 'Incident review details are invalid.' using errcode = '22023';
  end if;
  select incident.* into incident
  from public.education_discipline_incidents incident
  where incident.org_id = p_org_id and incident.id = p_incident_id
  for update;
  if not found then
    raise exception 'The incident was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, incident.branch_id, 'education_discipline', 'approve')
    and not public.education_can_access_branch(p_org_id, incident.branch_id, 'education_discipline', 'edit') then
    raise exception 'You do not have permission to review this incident.' using errcode = '42501';
  end if;

  update public.education_discipline_incidents
  set status = p_status,
      resolution_note = case when p_status in ('resolved', 'closed') then btrim(p_resolution_note) else null end,
      parent_notified = p_parent_notified,
      parent_notified_at = case when p_parent_notified then coalesce(parent_notified_at, now()) else null end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = incident.id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_discipline_incident_reviewed',
    'education_discipline_incident', incident.id,
    jsonb_build_object('branch_id', incident.branch_id, 'student_id', incident.student_id,
      'status', p_status, 'parent_notified', p_parent_notified)
  );
  return true;
end;
$$;

revoke all on function public.education_review_discipline_incident(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.education_review_discipline_incident(uuid, uuid, text, text, boolean) to authenticated;

create or replace function public.education_get_discipline_incidents(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_search text,
  p_status text,
  p_severity text
) returns table (
  incident_id uuid,
  branch_id uuid,
  student_id uuid,
  class_id uuid,
  staff_id uuid,
  incident_date date,
  category text,
  severity text,
  title text,
  description text,
  action_taken text,
  status text,
  parent_notified boolean,
  parent_notified_at timestamptz,
  resolution_note text,
  created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select incident.id, incident.branch_id, incident.student_id, incident.class_id,
         incident.staff_id, incident.incident_date, incident.category, incident.severity,
         incident.title, incident.description, incident.action_taken, incident.status,
         incident.parent_notified, incident.parent_notified_at, incident.resolution_note,
         incident.created_at
  from public.education_discipline_incidents incident
  where incident.org_id = p_org_id
    and incident.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
    and (p_status is null or incident.status = p_status)
    and (p_severity is null or incident.severity = p_severity)
    and (
      nullif(trim(p_search), '') is null
      or incident.title ilike '%' || p_search || '%'
      or incident.description ilike '%' || p_search || '%'
      or incident.action_taken ilike '%' || p_search || '%'
    )
    and public.education_can_access_branch(p_org_id, incident.branch_id, 'education_discipline', 'view')
  order by incident.incident_date desc, incident.created_at desc;
$$;

revoke all on function public.education_get_discipline_incidents(uuid, uuid[], text, text, text) from public, anon;
grant execute on function public.education_get_discipline_incidents(uuid, uuid[], text, text, text) to authenticated;

commit;
