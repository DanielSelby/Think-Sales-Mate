create table if not exists public.education_subjects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text collate "C" not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name),
  check (length(btrim(name)) > 0)
);

insert into public.education_subjects (org_id, name)
select legacy.org_id, legacy.subject_name
from (
  select org_id, subject_name
  from public.education_results
  where length(btrim(subject_name)) > 0
  union all
  select org_id, subject_name
  from public.education_timetable_entries
  where length(btrim(subject_name)) > 0
) legacy
on conflict (org_id, name) do nothing;

alter table public.education_results
  add column if not exists subject_id uuid;

alter table public.education_timetable_entries
  add column if not exists subject_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'education_results_org_subject_fkey'
      and conrelid = 'public.education_results'::regclass
  ) then
    alter table public.education_results
      add constraint education_results_org_subject_fkey
      foreign key (org_id, subject_id)
      references public.education_subjects(org_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'education_timetable_entries_org_subject_fkey'
      and conrelid = 'public.education_timetable_entries'::regclass
  ) then
    alter table public.education_timetable_entries
      add constraint education_timetable_entries_org_subject_fkey
      foreign key (org_id, subject_id)
      references public.education_subjects(org_id, id)
      on delete restrict;
  end if;
end;
$$;

update public.education_results result
set subject_id = subject.id
from public.education_subjects subject
where subject.org_id = result.org_id
  and subject.name = result.subject_name
  and length(btrim(result.subject_name)) > 0
  and result.subject_id is null;

update public.education_timetable_entries entry
set subject_id = subject.id
from public.education_subjects subject
where subject.org_id = entry.org_id
  and subject.name = entry.subject_name
  and length(btrim(entry.subject_name)) > 0
  and entry.subject_id is null;

create unique index if not exists education_results_subject_id_unique_idx
  on public.education_results (org_id, examination_id, student_id, subject_id)
  where subject_id is not null;

alter table public.education_timetable_entries
  drop constraint if exists education_timetable_entries_subject_name_check;
alter table public.education_timetable_entries
  add constraint education_timetable_entries_subject_name_check
  check (length(btrim(subject_name)) > 0);

create or replace function public.education_guard_result_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_name text;
begin
  if tg_op = 'UPDATE' then
    if new.subject_id is distinct from old.subject_id
      or new.subject_name is distinct from old.subject_name then
      raise exception 'A result subject and its display snapshot cannot be changed.'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if new.subject_id is null then
    raise exception 'A catalog subject is required for new results.'
      using errcode = '22023';
  end if;

  select subject.name into canonical_name
  from public.education_subjects subject
  where subject.org_id = new.org_id
    and subject.id = new.subject_id
    and subject.status = 'active'
  for update;

  if not found or new.subject_name is distinct from canonical_name then
    raise exception 'The selected subject is unavailable or its name does not match the catalog.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists education_results_subject_insert_guard on public.education_results;
create trigger education_results_subject_insert_guard
  before insert on public.education_results
  for each row execute function public.education_guard_result_subject();

drop trigger if exists education_results_subject_update_guard on public.education_results;
create trigger education_results_subject_update_guard
  before update on public.education_results
  for each row execute function public.education_guard_result_subject();

create or replace function public.education_guard_timetable_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_name text;
  canonical_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.subject_id is distinct from old.subject_id
      or new.subject_name is distinct from old.subject_name then
      raise exception 'A timetable subject and its display snapshot cannot be changed.'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if new.subject_id is null then
    select subject.id, subject.name
      into canonical_id, canonical_name
    from public.education_subjects subject
    where subject.org_id = new.org_id
      and subject.name = new.subject_name
      and subject.status = 'active'
    for update;
  else
    select subject.id, subject.name
      into canonical_id, canonical_name
    from public.education_subjects subject
    where subject.org_id = new.org_id
      and subject.id = new.subject_id
      and subject.status = 'active'
    for update;
  end if;

  if not found or new.subject_name is distinct from canonical_name then
    raise exception 'The selected subject is unavailable or its name does not match the catalog.'
      using errcode = '22023';
  end if;

  new.subject_id := canonical_id;
  new.subject_name := canonical_name;
  return new;
end;
$$;

drop trigger if exists education_timetable_subject_insert_guard on public.education_timetable_entries;
create trigger education_timetable_subject_insert_guard
  before insert on public.education_timetable_entries
  for each row execute function public.education_guard_timetable_subject();

drop trigger if exists education_timetable_subject_update_guard on public.education_timetable_entries;
create trigger education_timetable_subject_update_guard
  before update on public.education_timetable_entries
  for each row execute function public.education_guard_timetable_subject();

create or replace function public.education_guard_subject_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.org_id is distinct from old.org_id
    or new.name is distinct from old.name then
    raise exception 'Catalog subject names and organization ownership are immutable.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists education_subject_name_immutable on public.education_subjects;
create trigger education_subject_name_immutable
  before update on public.education_subjects
  for each row execute function public.education_guard_subject_name();

create or replace function public.education_create_timetable_entry(
  p_org_id uuid,
  p_branch_id uuid,
  p_class_id uuid,
  p_staff_id uuid,
  p_academic_year_id uuid,
  p_subject_name text,
  p_weekday smallint,
  p_starts_at time,
  p_ends_at time,
  p_room text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_entry_id uuid;
begin
  if not public.education_user_has_branch_scope(p_org_id, p_branch_id)
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_timetables', 'create') then
    raise exception 'You are not authorized to create a timetable entry at this campus.'
      using errcode = '42501';
  end if;
  if p_weekday not between 1 and 7
    or p_starts_at is null
    or p_ends_at is null
    or p_ends_at <= p_starts_at
    or nullif(btrim(p_subject_name), '') is null
    or length(btrim(coalesce(p_room, ''))) > 80 then
    raise exception 'The timetable entry contains invalid schedule details.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_classes classroom
    where classroom.org_id = p_org_id
      and classroom.branch_id = p_branch_id
      and classroom.id = p_class_id
      and classroom.academic_year_id = p_academic_year_id
      and classroom.status = 'active'
  ) then
    raise exception 'The selected class is not active in this academic year and campus.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_academic_years academic_year
    where academic_year.org_id = p_org_id
      and academic_year.id = p_academic_year_id
      and academic_year.status in ('planned', 'active')
  ) then
    raise exception 'Timetable entries can only be scheduled in a planned or active academic year.'
      using errcode = '22023';
  end if;
  if p_staff_id is not null and not exists (
    select 1
    from public.education_staff staff
    where staff.org_id = p_org_id
      and staff.branch_id = p_branch_id
      and staff.id = p_staff_id
      and staff.status = 'active'
  ) then
    raise exception 'The selected staff member is not active at this campus.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_org_id::text), hashtext(p_branch_id::text || p_weekday::text));
  if exists (
    select 1
    from public.education_timetable_entries entry
    where entry.org_id = p_org_id
      and entry.branch_id = p_branch_id
      and entry.academic_year_id = p_academic_year_id
      and entry.weekday = p_weekday
      and entry.status = 'active'
      and entry.starts_at < p_ends_at
      and entry.ends_at > p_starts_at
      and (
        entry.class_id = p_class_id
        or (p_staff_id is not null and entry.staff_id = p_staff_id)
        or (nullif(btrim(p_room), '') is not null and lower(entry.room) = lower(btrim(p_room)))
      )
  ) then
    raise exception 'The class, staff member, or room already has a timetable entry during that time.'
      using errcode = '23P01';
  end if;

  insert into public.education_timetable_entries (
    org_id, branch_id, class_id, staff_id, academic_year_id, subject_name,
    weekday, starts_at, ends_at, room, created_by
  ) values (
    p_org_id, p_branch_id, p_class_id, p_staff_id, p_academic_year_id, p_subject_name,
    p_weekday, p_starts_at, p_ends_at, nullif(btrim(p_room), ''), auth.uid()
  ) returning id into created_entry_id;
  return created_entry_id;
end;
$$;

alter table public.education_subjects enable row level security;

create policy "education subjects read"
  on public.education_subjects for select
  using (
    public.education_user_has_any_branch_scope(org_id)
    and public.has_org_product_permission(org_id, 'think-education', 'education_academics', 'view')
  );
create policy "education subjects create"
  on public.education_subjects for insert
  with check (public.education_can_access_organization(org_id, 'education_academics', 'create'));
create policy "education subjects update"
  on public.education_subjects for update
  using (public.education_can_access_organization(org_id, 'education_academics', 'edit'))
  with check (public.education_can_access_organization(org_id, 'education_academics', 'edit'));

revoke all on public.education_subjects from anon;
grant select, insert, update on public.education_subjects to authenticated;
revoke insert on public.education_subjects from authenticated;
grant insert (org_id, name) on public.education_subjects to authenticated;
revoke update on public.education_subjects from authenticated;
grant update (status, updated_at) on public.education_subjects to authenticated;

revoke all on function public.education_guard_result_subject() from public, anon;
revoke all on function public.education_guard_timetable_subject() from public, anon;
revoke all on function public.education_guard_subject_name() from public, anon;
revoke all on function public.education_create_timetable_entry(uuid, uuid, uuid, uuid, uuid, text, smallint, time, time, text)
  from public, anon;
grant execute on function public.education_create_timetable_entry(uuid, uuid, uuid, uuid, uuid, text, smallint, time, time, text)
  to authenticated;
