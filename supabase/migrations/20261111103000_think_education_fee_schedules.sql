begin;

create table if not exists public.education_fee_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  description text not null check (char_length(btrim(description)) between 1 and 160),
  amount numeric(12, 2) not null check (amount > 0),
  due_on date,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete restrict
);

alter table public.education_fee_charges
  add column if not exists schedule_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'education_fee_charges_org_schedule_fk'
      and conrelid = 'public.education_fee_charges'::regclass
  ) then
    alter table public.education_fee_charges
      add constraint education_fee_charges_org_schedule_fk
      foreign key (org_id, schedule_id)
      references public.education_fee_schedules(org_id, id) on delete restrict;
  end if;
end;
$$;

create unique index if not exists education_fee_charges_schedule_student_unique_idx
  on public.education_fee_charges (org_id, schedule_id, student_id)
  where schedule_id is not null;
create index if not exists education_fee_schedules_branch_year_idx
  on public.education_fee_schedules (org_id, branch_id, academic_year_id, created_at desc);

alter table public.education_fee_schedules enable row level security;

create policy "education fee schedules read"
  on public.education_fee_schedules for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_finance', 'view'));
create policy "education fee schedules create"
  on public.education_fee_schedules for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_finance', 'create'));

create or replace function public.education_validate_fee_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.education_classes classroom
    where classroom.org_id = new.org_id
      and classroom.branch_id = new.branch_id
      and classroom.id = new.class_id
      and classroom.academic_year_id = new.academic_year_id
      and classroom.status = 'active'
  ) then
    raise exception 'Fee schedules require an active class in the selected campus and academic year.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_academic_years academic_year
    where academic_year.org_id = new.org_id
      and academic_year.id = new.academic_year_id
      and academic_year.status in ('planned', 'active')
  ) then
    raise exception 'Fee schedules require a planned or active academic year.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger education_fee_schedule_validate
  before insert on public.education_fee_schedules
  for each row execute function public.education_validate_fee_schedule();
revoke all on function public.education_validate_fee_schedule() from public, anon, authenticated;

create or replace function public.education_apply_fee_schedule(
  p_org_id uuid,
  p_schedule_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule_row public.education_fee_schedules%rowtype;
  inserted_count integer;
begin
  select * into schedule_row
  from public.education_fee_schedules
  where org_id = p_org_id and id = p_schedule_id
  for update;
  if not found then
    raise exception 'The fee schedule was not found.'
      using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
    p_org_id, schedule_row.branch_id, 'education_finance', 'create'
  ) then
    raise exception 'You are not authorized to apply fees at this campus.'
      using errcode = '42501';
  end if;
  if schedule_row.status <> 'active'
    or not exists (
      select 1 from public.education_academic_years academic_year
      where academic_year.org_id = p_org_id
        and academic_year.id = schedule_row.academic_year_id
        and academic_year.status in ('planned', 'active')
    ) then
    raise exception 'Only active fee schedules in a planned or active academic year can be applied.'
      using errcode = '22023';
  end if;

  insert into public.education_fee_charges (
    org_id, branch_id, student_id, academic_year_id, schedule_id,
    description, amount, due_on, created_by
  )
  select
    schedule_row.org_id,
    schedule_row.branch_id,
    enrollment.student_id,
    schedule_row.academic_year_id,
    schedule_row.id,
    schedule_row.description,
    schedule_row.amount,
    schedule_row.due_on,
    auth.uid()
  from public.education_student_enrollments enrollment
  join public.education_students student
    on student.org_id = enrollment.org_id
   and student.id = enrollment.student_id
   and student.branch_id = enrollment.branch_id
  where enrollment.org_id = p_org_id
    and enrollment.branch_id = schedule_row.branch_id
    and enrollment.class_id = schedule_row.class_id
    and enrollment.academic_year_id = schedule_row.academic_year_id
    and enrollment.status = 'active'
    and student.status = 'active'
  on conflict (org_id, schedule_id, student_id) where schedule_id is not null
    do nothing;
  get diagnostics inserted_count = row_count;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'schedule_applied', 'education_fee_schedule', schedule_row.id,
    jsonb_build_object(
      'branch_id', schedule_row.branch_id,
      'class_id', schedule_row.class_id,
      'academic_year_id', schedule_row.academic_year_id,
      'charges_created', inserted_count
    )
  );
  return inserted_count;
end;
$$;

revoke all on function public.education_apply_fee_schedule(uuid, uuid) from public, anon;
grant execute on function public.education_apply_fee_schedule(uuid, uuid) to authenticated;

grant select on public.education_fee_schedules to authenticated;
grant insert (org_id, branch_id, class_id, academic_year_id, description, amount, due_on)
  on public.education_fee_schedules to authenticated;
revoke update, delete on public.education_fee_schedules from authenticated;
revoke all on public.education_fee_schedules from anon;

commit;
