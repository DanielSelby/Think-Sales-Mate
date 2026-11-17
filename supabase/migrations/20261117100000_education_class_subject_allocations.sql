create table if not exists public.education_class_subjects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  lead_staff_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, class_id, subject_id),
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, subject_id)
    references public.education_subjects(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, lead_staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict
);

create index if not exists education_class_subjects_branch_status_idx
  on public.education_class_subjects(org_id, branch_id, status, class_id);

alter table public.education_class_subjects enable row level security;

create policy "education class subjects read"
  on public.education_class_subjects for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_academics', 'view'));

revoke all on public.education_class_subjects from anon, authenticated;
grant select on public.education_class_subjects to authenticated;

create or replace function public.education_set_class_subject(
  p_org_id uuid,
  p_class_id uuid,
  p_subject_id uuid,
  p_lead_staff_id uuid,
  p_status text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  class_row public.education_classes%rowtype;
  assignment_row public.education_class_subjects%rowtype;
  assignment_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_class_id is null or p_subject_id is null
    or p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'The class-subject assignment details are invalid.'
      using errcode = '22023';
  end if;

  select * into class_row
  from public.education_classes
  where org_id = p_org_id and id = p_class_id
  for update;
  if not found then
    raise exception 'The selected class is unavailable.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_org_id::text), hashtext(p_class_id::text || ':' || p_subject_id::text));

  select * into assignment_row
  from public.education_class_subjects
  where org_id = p_org_id and class_id = p_class_id and subject_id = p_subject_id
  for update;

  if assignment_row.id is null then
    if p_status <> 'active'
      or class_row.status <> 'active'
      or not public.education_can_access_branch(p_org_id, class_row.branch_id, 'education_academics', 'create') then
      raise exception 'You are not authorized to assign a subject to this class.'
        using errcode = '42501';
    end if;
  elsif not public.education_can_access_branch(p_org_id, class_row.branch_id, 'education_academics', 'edit') then
    raise exception 'You are not authorized to update this class-subject assignment.'
      using errcode = '42501';
  end if;

  if assignment_row.id is not null
    and not public.education_can_access_branch(p_org_id, class_row.branch_id, 'education_staff', 'view')
    and assignment_row.lead_staff_id is distinct from p_lead_staff_id then
    raise exception 'Staff view access is required to change the lead teacher.'
      using errcode = '42501';
  end if;

  if p_status = 'active' and not exists (
    select 1
    from public.education_subjects subject
    where subject.org_id = p_org_id
      and subject.id = p_subject_id
      and subject.status = 'active'
  ) then
    raise exception 'The selected subject is unavailable or inactive.'
      using errcode = '22023';
  end if;

  if p_status = 'active' and class_row.status <> 'active' then
    raise exception 'An inactive class cannot have active subject assignments.'
      using errcode = '22023';
  end if;

  if p_lead_staff_id is not null and (
    (not public.education_can_access_branch(p_org_id, class_row.branch_id, 'education_staff', 'view')
      and (assignment_row.id is null or assignment_row.lead_staff_id is distinct from p_lead_staff_id))
    or not exists (
      select 1
      from public.education_staff staff
      where staff.org_id = p_org_id
        and staff.branch_id = class_row.branch_id
        and staff.id = p_lead_staff_id
        and staff.staff_category = 'teaching'
        and (p_status = 'inactive' or staff.status = 'active')
    )
  ) then
    raise exception 'The selected lead teacher is unavailable for this campus.'
      using errcode = '22023';
  end if;

  if assignment_row.id is null then
    insert into public.education_class_subjects (
      org_id, branch_id, class_id, subject_id, lead_staff_id, status, created_by
    ) values (
      p_org_id, class_row.branch_id, p_class_id, p_subject_id, p_lead_staff_id, 'active', auth.uid()
    ) returning id into assignment_id;
  else
    update public.education_class_subjects
    set lead_staff_id = p_lead_staff_id,
        status = p_status,
        updated_at = now()
    where id = assignment_row.id
    returning id into assignment_id;
  end if;

  return assignment_id;
end;
$$;

create or replace function public.education_guard_timetable_class_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_id uuid;
begin
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id then
    return new;
  end if;

  if new.subject_id is null then
    select subject.id into subject_id
    from public.education_subjects subject
    where subject.org_id = new.org_id
      and subject.name = new.subject_name
      and subject.status = 'active';
  else
    subject_id := new.subject_id;
  end if;

  if subject_id is null or not exists (
    select 1
    from public.education_class_subjects assignment
    where assignment.org_id = new.org_id
      and assignment.branch_id = new.branch_id
      and assignment.class_id = new.class_id
      and assignment.subject_id = subject_id
      and assignment.status = 'active'
  ) then
    raise exception 'The selected subject is not actively assigned to this class.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists education_timetable_class_subject_insert_guard on public.education_timetable_entries;
create trigger education_timetable_class_subject_insert_guard
  before insert on public.education_timetable_entries
  for each row execute function public.education_guard_timetable_class_subject();

drop trigger if exists education_timetable_class_subject_update_guard on public.education_timetable_entries;
create trigger education_timetable_class_subject_update_guard
  before update on public.education_timetable_entries
  for each row execute function public.education_guard_timetable_class_subject();

revoke all on function public.education_set_class_subject(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.education_set_class_subject(uuid, uuid, uuid, uuid, text) to authenticated;
revoke all on function public.education_guard_timetable_class_subject() from public, anon;
