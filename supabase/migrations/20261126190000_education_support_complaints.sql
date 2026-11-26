begin;

create table if not exists public.education_support_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid,
  requester_user_id uuid references auth.users(id) on delete set null,
  requester_name text not null check (char_length(btrim(requester_name)) between 1 and 160),
  request_kind text not null check (request_kind in ('helpdesk', 'complaint')),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  subject text not null check (char_length(btrim(subject)) between 1 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  assigned_staff_id uuid,
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, assigned_staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict
);

create table if not exists public.education_support_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  author_user_id uuid references auth.users(id) on delete set null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (org_id, request_id)
    references public.education_support_requests(org_id, id) on delete cascade
);

create index if not exists education_support_request_lookup_idx
  on public.education_support_requests (org_id, branch_id, status, priority, created_at desc);
create index if not exists education_support_response_lookup_idx
  on public.education_support_responses (org_id, request_id, created_at desc);

alter table public.education_support_requests enable row level security;
alter table public.education_support_responses enable row level security;
revoke all on public.education_support_requests from public, anon, authenticated;
revoke all on public.education_support_responses from public, anon, authenticated;

create or replace function public.education_create_support_request(
  p_org_id uuid,
  p_branch_id uuid,
  p_request_kind text,
  p_category text,
  p_priority text,
  p_subject text,
  p_description text,
  p_requester_name text,
  p_student_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_request_kind not in ('helpdesk', 'complaint')
    or char_length(btrim(coalesce(p_category, ''))) not between 1 and 80
    or p_priority not in ('low', 'normal', 'high', 'urgent')
    or char_length(btrim(coalesce(p_subject, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_description, ''))) not between 1 and 5000
    or char_length(btrim(coalesce(p_requester_name, ''))) not between 1 and 160 then
    raise exception 'Support request details are invalid.' using errcode = '22023';
  end if;

  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_support', 'create')
    and not exists (
      select 1 from public.education_guardians guardian
      where guardian.org_id = p_org_id
        and guardian.user_id = auth.uid()
        and guardian.status = 'active'
    )
    and not exists (
      select 1 from public.education_students student
      where student.org_id = p_org_id
        and student.branch_id = p_branch_id
        and student.user_id = auth.uid()
        and student.status = 'active'
    ) then
    raise exception 'You are not authorized to create a support request.' using errcode = '42501';
  end if;

  if p_student_id is not null and not exists (
    select 1 from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.id = p_student_id
  ) then
    raise exception 'The selected student was not found.' using errcode = 'P0002';
  end if;

  insert into public.education_support_requests (
    org_id, branch_id, student_id, requester_user_id, requester_name,
    request_kind, category, priority, subject, description, status,
    created_by, updated_at
  ) values (
    p_org_id, p_branch_id, p_student_id, auth.uid(), btrim(p_requester_name),
    p_request_kind, btrim(p_category), p_priority, btrim(p_subject), btrim(p_description),
    'open', auth.uid(), now()
  ) returning id into request_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_support_request_created',
    'education_support_request', request_id,
    jsonb_build_object('branch_id', p_branch_id, 'request_kind', p_request_kind,
      'category', p_category, 'priority', p_priority)
  );
  return request_id;
end;
$$;

revoke all on function public.education_create_support_request(uuid, uuid, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.education_create_support_request(uuid, uuid, text, text, text, text, text, text, uuid) to authenticated;

create or replace function public.education_update_support_request(
  p_org_id uuid,
  p_request_id uuid,
  p_status text,
  p_assigned_staff_id uuid,
  p_resolution_note text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.education_support_requests%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_request_id is null
    or p_status not in ('open', 'in_progress', 'waiting', 'resolved', 'closed')
    or char_length(coalesce(p_resolution_note, '')) > 5000
    or (p_status in ('resolved', 'closed') and char_length(btrim(coalesce(p_resolution_note, ''))) < 1) then
    raise exception 'Support request update is invalid.' using errcode = '22023';
  end if;
  select * into request
  from public.education_support_requests
  where org_id = p_org_id and id = p_request_id
  for update;
  if not found then
    raise exception 'The support request was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, request.branch_id, 'education_support', 'edit') then
    raise exception 'You do not have permission to update this request.' using errcode = '42501';
  end if;

  if p_assigned_staff_id is not null and not exists (
    select 1 from public.education_staff staff
    where staff.org_id = p_org_id
      and staff.branch_id = request.branch_id
      and staff.id = p_assigned_staff_id
      and staff.status = 'active'
  ) then
    raise exception 'The assigned staff member was not found.' using errcode = 'P0002';
  end if;

  update public.education_support_requests
  set status = p_status,
      assigned_staff_id = p_assigned_staff_id,
      resolution_note = case when p_status in ('resolved', 'closed') then btrim(p_resolution_note) else null end,
      resolved_by = case when p_status in ('resolved', 'closed') then auth.uid() else null end,
      resolved_at = case when p_status in ('resolved', 'closed') then now() else null end,
      updated_at = now()
  where id = request.id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_support_request_updated',
    'education_support_request', request.id,
    jsonb_build_object('branch_id', request.branch_id, 'status', p_status,
      'assigned_staff_id', p_assigned_staff_id)
  );
  return true;
end;
$$;

revoke all on function public.education_update_support_request(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.education_update_support_request(uuid, uuid, text, uuid, text) to authenticated;

create or replace function public.education_add_support_response(
  p_org_id uuid,
  p_request_id uuid,
  p_message text,
  p_is_internal boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.education_support_requests%rowtype;
  response_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_request_id is null
    or char_length(btrim(coalesce(p_message, ''))) not between 1 and 5000
    or p_is_internal is null then
    raise exception 'Support response details are invalid.' using errcode = '22023';
  end if;
  select * into request
  from public.education_support_requests
  where org_id = p_org_id and id = p_request_id
  for update;
  if not found then
    raise exception 'The support request was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, request.branch_id, 'education_support', 'edit')
    and not (request.requester_user_id = auth.uid()) then
    raise exception 'You are not authorized to respond to this request.' using errcode = '42501';
  end if;
  if p_is_internal and not public.education_can_access_branch(p_org_id, request.branch_id, 'education_support', 'edit') then
    raise exception 'Internal responses require support edit access.' using errcode = '42501';
  end if;

  insert into public.education_support_responses (
    org_id, request_id, message, author_user_id, is_internal
  ) values (
    p_org_id, p_request_id, btrim(p_message), auth.uid(), p_is_internal
  ) returning id into response_id;

  update public.education_support_requests
  set updated_at = now()
  where id = p_request_id;
  return response_id;
end;
$$;

revoke all on function public.education_add_support_response(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.education_add_support_response(uuid, uuid, text, boolean) to authenticated;

create or replace function public.education_get_support_requests(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_request_kind text,
  p_status text,
  p_search text
) returns table (
  request_id uuid,
  branch_id uuid,
  student_id uuid,
  requester_name text,
  request_kind text,
  category text,
  priority text,
  subject text,
  description text,
  status text,
  assigned_staff_id uuid,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select request.id, request.branch_id, request.student_id, request.requester_name,
         request.request_kind, request.category, request.priority, request.subject,
         request.description, request.status, request.assigned_staff_id,
         request.resolution_note, request.resolved_at, request.created_at
  from public.education_support_requests request
  where request.org_id = p_org_id
    and request.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
    and (p_request_kind is null or request.request_kind = p_request_kind)
    and (p_status is null or request.status = p_status)
    and (
      nullif(trim(p_search), '') is null
      or request.requester_name ilike '%' || p_search || '%'
      or request.subject ilike '%' || p_search || '%'
      or request.description ilike '%' || p_search || '%'
    )
    and public.education_can_access_branch(p_org_id, request.branch_id, 'education_support', 'view')
  order by
    case request.priority
      when 'urgent' then 1
      when 'high' then 2
      when 'normal' then 3
      else 4
    end,
    request.created_at desc;
$$;

revoke all on function public.education_get_support_requests(uuid, uuid[], text, text, text) from public, anon;
grant execute on function public.education_get_support_requests(uuid, uuid[], text, text, text) to authenticated;

create or replace function public.education_get_support_responses(
  p_org_id uuid,
  p_request_id uuid
) returns table (
  response_id uuid,
  message text,
  author_user_id uuid,
  is_internal boolean,
  created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select response.id, response.message, response.author_user_id,
         response.is_internal, response.created_at
  from public.education_support_responses response
  join public.education_support_requests request
    on request.org_id = response.org_id
    and request.id = response.request_id
  where response.org_id = p_org_id
    and response.request_id = p_request_id
    and (
      public.education_can_access_branch(p_org_id, request.branch_id, 'education_support', 'view')
      or request.requester_user_id = auth.uid()
    )
    and (
      not response.is_internal
      or public.education_can_access_branch(p_org_id, request.branch_id, 'education_support', 'edit')
    )
  order by response.created_at asc;
$$;

revoke all on function public.education_get_support_responses(uuid, uuid) from public, anon;
grant execute on function public.education_get_support_responses(uuid, uuid) to authenticated;

commit;
