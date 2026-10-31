begin;

create table if not exists public.restaurant_catering_prep_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  notes text not null default '' check (length(notes) <= 2000),
  due_at timestamptz not null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30),
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, event_id)
    references public.restaurant_catering_events(org_id, id) on delete cascade
);

create index if not exists restaurant_catering_prep_tasks_event_due_idx
  on public.restaurant_catering_prep_tasks(org_id, event_id, due_at);
create index if not exists restaurant_catering_prep_tasks_assignee_status_idx
  on public.restaurant_catering_prep_tasks(org_id, assigned_to, status, due_at);

alter table public.restaurant_catering_prep_tasks enable row level security;

drop policy if exists "Restaurant catering prep tasks: members read assigned events"
  on public.restaurant_catering_prep_tasks;
create policy "Restaurant catering prep tasks: members read assigned events"
  on public.restaurant_catering_prep_tasks for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1 from public.restaurant_catering_events event
      where event.org_id = restaurant_catering_prep_tasks.org_id
        and event.id = restaurant_catering_prep_tasks.event_id
        and public.can_access_org_location(restaurant_catering_prep_tasks.org_id, event.location_id)
    )
  );

revoke all on public.restaurant_catering_prep_tasks from public, anon, authenticated;
grant select on public.restaurant_catering_prep_tasks to authenticated;
grant all on public.restaurant_catering_prep_tasks to service_role;

create or replace function public.create_restaurant_catering_prep_task(
  p_org_id uuid,
  p_event_id uuid,
  p_title text,
  p_notes text,
  p_due_at timestamptz,
  p_assigned_to uuid,
  p_checklist jsonb,
  p_created_by uuid
)
returns public.restaurant_catering_prep_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.restaurant_catering_events%rowtype;
  created_task public.restaurant_catering_prep_tasks%rowtype;
  checklist_item jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create catering preparation tasks.';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 160
    or length(coalesce(p_notes, '')) > 2000
    or p_due_at is null
    or p_checklist is null
    or jsonb_typeof(p_checklist) <> 'array'
    or jsonb_array_length(p_checklist) > 30 then
    raise exception 'Enter a valid preparation task, due time, and checklist.';
  end if;
  for checklist_item in select value from jsonb_array_elements(p_checklist)
  loop
    if jsonb_typeof(checklist_item) <> 'object'
      or length(btrim(coalesce(checklist_item->>'title', ''))) not between 1 and 200
      or coalesce(checklist_item->>'completed', 'false') not in ('true', 'false') then
      raise exception 'Each checklist item must have a title and completion state.';
    end if;
  end loop;

  select * into target_event
  from public.restaurant_catering_events
  where org_id = p_org_id and id = p_event_id
  for share;
  if not found or target_event.status in ('completed', 'cancelled') then
    raise exception 'Preparation tasks require an active catering event.';
  end if;
  if p_due_at > target_event.starts_at then
    raise exception 'A preparation task must be due no later than the event start time.';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.organization_members member
    where member.org_id = p_org_id
      and member.user_id = p_assigned_to
      and member.status = 'active'
      and (
        member.branch_scope = 'all'
        or member.location_id = target_event.location_id
        or target_event.location_id = any(coalesce(member.secondary_location_ids, '{}'::uuid[]))
      )
  ) then
    raise exception 'Choose an active staff member assigned to this event branch.';
  end if;

  insert into public.restaurant_catering_prep_tasks (
    org_id, event_id, title, notes, due_at, assigned_to, checklist, created_by, updated_by
  ) values (
    p_org_id, p_event_id, btrim(p_title), btrim(coalesce(p_notes, '')),
    p_due_at, p_assigned_to, p_checklist, p_created_by, p_created_by
  ) returning * into created_task;
  return created_task;
end;
$$;

revoke all on function public.create_restaurant_catering_prep_task(uuid, uuid, text, text, timestamptz, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_restaurant_catering_prep_task(uuid, uuid, text, text, timestamptz, uuid, jsonb, uuid)
  to service_role;

create or replace function public.update_restaurant_catering_prep_task(
  p_org_id uuid,
  p_task_id uuid,
  p_status text,
  p_assigned_to uuid,
  p_updated_by uuid
)
returns public.restaurant_catering_prep_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_task public.restaurant_catering_prep_tasks%rowtype;
  target_event public.restaurant_catering_events%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can update catering preparation tasks.';
  end if;
  if p_status not in ('pending', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Choose a valid preparation task status.';
  end if;

  select * into target_task
  from public.restaurant_catering_prep_tasks
  where org_id = p_org_id and id = p_task_id
  for update;
  if not found then raise exception 'Preparation task not found.'; end if;

  select * into target_event
  from public.restaurant_catering_events
  where org_id = p_org_id and id = target_task.event_id;
  if not found or target_event.status in ('completed', 'cancelled') then
    raise exception 'Preparation tasks cannot be changed for a closed event.';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.organization_members member
    where member.org_id = p_org_id
      and member.user_id = p_assigned_to
      and member.status = 'active'
      and (
        member.branch_scope = 'all'
        or member.location_id = target_event.location_id
        or target_event.location_id = any(coalesce(member.secondary_location_ids, '{}'::uuid[]))
      )
  ) then
    raise exception 'Choose an active staff member assigned to this event branch.';
  end if;

  update public.restaurant_catering_prep_tasks
  set status = p_status, assigned_to = p_assigned_to,
      updated_by = p_updated_by, updated_at = now()
  where org_id = p_org_id and id = p_task_id
  returning * into target_task;
  return target_task;
end;
$$;

revoke all on function public.update_restaurant_catering_prep_task(uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.update_restaurant_catering_prep_task(uuid, uuid, text, uuid, uuid)
  to service_role;

create or replace function public.update_restaurant_catering_prep_checklist_item(
  p_org_id uuid,
  p_task_id uuid,
  p_item_index integer,
  p_completed boolean,
  p_updated_by uuid
)
returns public.restaurant_catering_prep_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_task public.restaurant_catering_prep_tasks%rowtype;
  target_event public.restaurant_catering_events%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can update catering preparation checklists.';
  end if;
  if p_item_index is null or p_item_index < 0 or p_completed is null then
    raise exception 'Choose a valid checklist item and completion state.';
  end if;

  select * into target_task
  from public.restaurant_catering_prep_tasks
  where org_id = p_org_id and id = p_task_id
  for update;
  if not found or p_item_index >= jsonb_array_length(target_task.checklist) then
    raise exception 'Preparation checklist item not found.';
  end if;
  select * into target_event
  from public.restaurant_catering_events
  where org_id = p_org_id and id = target_task.event_id;
  if not found or target_event.status in ('completed', 'cancelled') then
    raise exception 'Preparation checklists cannot be changed for a closed event.';
  end if;

  update public.restaurant_catering_prep_tasks
  set checklist = jsonb_set(checklist, array[p_item_index::text, 'completed'], to_jsonb(p_completed), false),
      updated_by = p_updated_by, updated_at = now()
  where org_id = p_org_id and id = p_task_id
  returning * into target_task;
  return target_task;
end;
$$;

revoke all on function public.update_restaurant_catering_prep_checklist_item(uuid, uuid, integer, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.update_restaurant_catering_prep_checklist_item(uuid, uuid, integer, boolean, uuid)
  to service_role;

commit;
