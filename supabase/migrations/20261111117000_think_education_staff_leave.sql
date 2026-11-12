create table if not exists public.education_staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  staff_id uuid not null,
  leave_type text not null check (leave_type in (
    'annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other'
  )),
  starts_on date not null,
  ends_on date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  check (ends_on >= starts_on),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict
);

create index if not exists education_staff_leave_branch_status_date_idx
  on public.education_staff_leave_requests (org_id, branch_id, status, starts_on desc);
create index if not exists education_staff_leave_staff_date_idx
  on public.education_staff_leave_requests (org_id, staff_id, starts_on, ends_on);

alter table public.education_staff_leave_requests enable row level security;

create policy "education staff leave read"
  on public.education_staff_leave_requests for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_staff', 'view'));

revoke all on public.education_staff_leave_requests from anon, authenticated;
grant select on public.education_staff_leave_requests to authenticated;

create or replace function public.education_staff_leave_request(
  p_org_id uuid,
  p_branch_id uuid,
  p_staff_id uuid,
  p_leave_type text,
  p_starts_on date,
  p_ends_on date,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.education_staff%rowtype;
  leave_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_staff_id is null or p_starts_on is null or p_ends_on is null
    or p_ends_on < p_starts_on
    or p_leave_type is null
    or p_leave_type not in ('annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other')
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'Leave request details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_staff', 'create') then
    raise exception 'You cannot create staff leave requests at this campus.' using errcode = '42501';
  end if;

  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = p_org_id
    and staff.branch_id = p_branch_id
    and staff.id = p_staff_id
    and staff.status in ('active', 'on_leave')
  for update;
  if not found then
    raise exception 'The staff member is unavailable at this campus.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.education_staff_leave_requests request
    where request.org_id = p_org_id
      and request.staff_id = p_staff_id
      and request.status in ('pending', 'approved')
      and daterange(request.starts_on, request.ends_on, '[]')
        && daterange(p_starts_on, p_ends_on, '[]')
  ) then
    raise exception 'This request overlaps another pending or approved leave request.' using errcode = '23505';
  end if;

  insert into public.education_staff_leave_requests (
    org_id, branch_id, staff_id, leave_type, starts_on, ends_on, reason, requested_by
  ) values (
    p_org_id, p_branch_id, p_staff_id, p_leave_type, p_starts_on, p_ends_on,
    btrim(p_reason), auth.uid()
  )
  returning id into leave_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_staff_leave_requested',
    'education_staff_leave_request', leave_id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'staff_id', p_staff_id,
      'leave_type', p_leave_type,
      'starts_on', p_starts_on,
      'ends_on', p_ends_on
    )
  );
  return leave_id;
end;
$$;

create or replace function public.education_staff_leave_decide(
  p_org_id uuid,
  p_request_id uuid,
  p_decision text,
  p_decision_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.education_staff_leave_requests%rowtype;
  staff_row public.education_staff%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_request_id is null
    or p_decision is null or p_decision not in ('approved', 'rejected')
    or (p_decision_note is not null and char_length(btrim(p_decision_note)) > 1000)
    or (p_decision = 'rejected' and nullif(btrim(p_decision_note), '') is null) then
    raise exception 'Leave decision details are invalid.' using errcode = '22023';
  end if;

  select request.* into request_row
  from public.education_staff_leave_requests request
  where request.org_id = p_org_id
    and request.id = p_request_id
  for update;
  if not found or request_row.status <> 'pending' then
    raise exception 'This leave request is not available for a decision.' using errcode = 'P0002';
  end if;
  if request_row.requested_by = auth.uid() then
    raise exception 'You cannot approve or reject a leave request you submitted.' using errcode = '42501';
  end if;
  if not public.education_can_access_branch(p_org_id, request_row.branch_id, 'education_staff', 'approve') then
    raise exception 'You cannot approve or reject staff leave at this campus.' using errcode = '42501';
  end if;

  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = p_org_id
    and staff.branch_id = request_row.branch_id
    and staff.id = request_row.staff_id
  for update;
  if not found then
    raise exception 'The staff member is unavailable.' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' and exists (
    select 1
    from public.education_staff_leave_requests other_request
    where other_request.org_id = p_org_id
      and other_request.staff_id = request_row.staff_id
      and other_request.id <> request_row.id
      and other_request.status = 'approved'
      and daterange(other_request.starts_on, other_request.ends_on, '[]')
        && daterange(request_row.starts_on, request_row.ends_on, '[]')
  ) then
    raise exception 'The leave dates conflict with an already approved request.' using errcode = '23505';
  end if;

  update public.education_staff_leave_requests
  set status = p_decision,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_note = nullif(btrim(p_decision_note), ''),
      updated_at = now()
  where id = request_row.id
    and org_id = p_org_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_staff_leave_' || p_decision,
    'education_staff_leave_request', request_row.id,
    jsonb_build_object(
      'branch_id', request_row.branch_id,
      'staff_id', request_row.staff_id,
      'previous_status', request_row.status,
      'status', p_decision,
      'decision_note', nullif(btrim(p_decision_note), '')
    )
  );
  return true;
end;
$$;

revoke all on function public.education_staff_leave_request(uuid, uuid, uuid, text, date, date, text)
  from public, anon;
grant execute on function public.education_staff_leave_request(uuid, uuid, uuid, text, date, date, text)
  to authenticated;
revoke all on function public.education_staff_leave_decide(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.education_staff_leave_decide(uuid, uuid, text, text)
  to authenticated;
