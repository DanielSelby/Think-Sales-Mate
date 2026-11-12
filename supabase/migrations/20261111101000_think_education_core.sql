create unique index if not exists business_locations_org_id_id_idx
  on public.business_locations (org_id, id);

create table if not exists public.education_member_branch_scopes (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  scope_type text not null check (scope_type in ('organization', 'branch')),
  branch_id uuid,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint education_member_branch_scopes_scope_check
    check ((scope_type = 'organization' and branch_id is null) or (scope_type = 'branch' and branch_id is not null)),
  foreign key (org_id, user_id)
    references public.organization_members(org_id, user_id) on delete cascade,
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete cascade
);

create unique index if not exists education_member_branch_scopes_org_unique_idx
  on public.education_member_branch_scopes (org_id, user_id)
  where scope_type = 'organization';
create unique index if not exists education_member_branch_scopes_branch_unique_idx
  on public.education_member_branch_scopes (org_id, user_id, branch_id)
  where scope_type = 'branch';
create index if not exists education_member_branch_scopes_branch_idx
  on public.education_member_branch_scopes (org_id, branch_id, user_id)
  where scope_type = 'branch';

create table if not exists public.education_institution_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  institution_name text not null,
  institution_code text not null,
  institution_type text not null check (institution_type in (
    'basic', 'primary', 'junior_high', 'senior_high', 'college', 'university', 'technical_vocational', 'training', 'other'
  )),
  terminology jsonb not null default '{}'::jsonb check (jsonb_typeof(terminology) = 'object'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.education_campuses (
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  administrator_user_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, branch_id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete cascade,
  foreign key (org_id, administrator_user_id)
    references public.organization_members(org_id, user_id)
);

create table if not exists public.education_academic_years (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'archived')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  unique (org_id, id),
  check (ends_on >= starts_on)
);
create unique index if not exists education_academic_years_current_unique_idx
  on public.education_academic_years (org_id)
  where is_current;

create table if not exists public.education_academic_terms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  academic_year_id uuid not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  sequence_number integer not null check (sequence_number > 0),
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  unique (org_id, academic_year_id, name),
  unique (org_id, academic_year_id, sequence_number),
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete cascade,
  check (ends_on >= starts_on)
);
create unique index if not exists education_academic_terms_org_id_id_idx
  on public.education_academic_terms (org_id, id);

create table if not exists public.education_departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid,
  name text not null,
  department_type text not null default 'academic' check (department_type in ('academic', 'administrative', 'support')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete cascade
);

create table if not exists public.education_students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  student_number text not null,
  first_name text not null,
  last_name text not null,
  other_names text,
  email text,
  phone text,
  date_of_birth date,
  gender text,
  status text not null default 'active' check (status in ('active', 'on_hold', 'graduated', 'transferred', 'withdrawn', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, branch_id, id),
  unique (org_id, student_number),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict
);
create index if not exists education_students_branch_status_idx
  on public.education_students (org_id, branch_id, status);
create index if not exists education_students_name_idx
  on public.education_students (org_id, last_name, first_name);

create table if not exists public.education_staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  user_id uuid,
  staff_number text not null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  staff_category text not null check (staff_category in ('teaching', 'non_teaching')),
  department_id uuid,
  job_title text,
  status text not null default 'active' check (status in ('active', 'inactive', 'on_leave', 'suspended', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, branch_id, id),
  unique (org_id, staff_number),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, user_id)
    references public.organization_members(org_id, user_id),
  foreign key (org_id, department_id)
    references public.education_departments(org_id, id)
);
create index if not exists education_staff_branch_status_idx
  on public.education_staff (org_id, branch_id, status);

create table if not exists public.education_classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  academic_year_id uuid not null,
  department_id uuid,
  name text not null,
  level_name text,
  stream_name text,
  class_teacher_id uuid,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, branch_id, id),
  unique (org_id, branch_id, academic_year_id, name),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete restrict,
  foreign key (org_id, department_id)
    references public.education_departments(org_id, id),
  foreign key (org_id, class_teacher_id)
    references public.education_staff(org_id, id)
);
create index if not exists education_classes_branch_year_idx
  on public.education_classes (org_id, branch_id, academic_year_id, status);

create table if not exists public.education_timetable_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  class_id uuid not null,
  staff_id uuid,
  academic_year_id uuid not null,
  subject_name text not null,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  room text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  check (ends_at > starts_at),
  check (length(trim(subject_name)) between 1 and 120),
  check (room is null or length(trim(room)) <= 80),
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete restrict
);
create index if not exists education_timetable_branch_year_day_idx
  on public.education_timetable_entries (org_id, branch_id, academic_year_id, weekday, starts_at)
  where status = 'active';

create table if not exists public.education_student_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  status text not null default 'active' check (status in ('active', 'completed', 'withdrawn', 'transferred')),
  enrolled_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, student_id, academic_year_id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, student_id)
    references public.education_students(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete restrict
);

create table if not exists public.education_admissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  application_number text not null,
  applicant_first_name text not null,
  applicant_last_name text not null,
  applicant_email text,
  applicant_phone text,
  requested_class_id uuid,
  status text not null default 'pending' check (status in ('pending', 'under_review', 'admitted', 'rejected', 'withdrawn', 'enrolled')),
  applied_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, application_number),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, requested_class_id)
    references public.education_classes(org_id, id),
  foreign key (org_id, branch_id, requested_class_id)
    references public.education_classes(org_id, branch_id, id)
);
create index if not exists education_admissions_branch_status_idx
  on public.education_admissions (org_id, branch_id, status, applied_at desc);

create table if not exists public.education_attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  class_id uuid,
  student_id uuid,
  staff_id uuid,
  attendance_date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  check ((student_id is not null) <> (staff_id is not null)),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, class_id)
    references public.education_classes(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, student_id)
    references public.education_students(org_id, id) on delete restrict,
  foreign key (org_id, staff_id)
    references public.education_staff(org_id, id) on delete restrict
);
create index if not exists education_attendance_branch_date_idx
  on public.education_attendance (org_id, branch_id, attendance_date desc, status);
create unique index if not exists education_attendance_student_daily_unique_idx
  on public.education_attendance (org_id, student_id, attendance_date)
  where student_id is not null;
create unique index if not exists education_attendance_staff_daily_unique_idx
  on public.education_attendance (org_id, staff_id, attendance_date)
  where staff_id is not null;

create table if not exists public.education_examinations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid,
  name text not null,
  examination_type text not null default 'examination',
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'in_progress', 'completed', 'results_pending', 'published', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete restrict,
  foreign key (org_id, term_id)
    references public.education_academic_terms(org_id, id)
);
create index if not exists education_examinations_branch_status_idx
  on public.education_examinations (org_id, branch_id, status, starts_at);

create table if not exists public.education_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  examination_id uuid not null,
  student_id uuid not null,
  subject_name text not null,
  score numeric(8,2) not null check (score >= 0),
  maximum_score numeric(8,2) not null check (maximum_score > 0 and score <= maximum_score),
  grade text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'published')),
  entered_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, examination_id, student_id, subject_name),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, examination_id)
    references public.education_examinations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, examination_id)
    references public.education_examinations(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, student_id)
    references public.education_students(org_id, id) on delete restrict
);
create index if not exists education_results_branch_examination_idx
  on public.education_results (org_id, branch_id, examination_id, status);

create table if not exists public.education_student_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null,
  source_branch_id uuid not null,
  destination_branch_id uuid not null,
  effective_on date not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  check (source_branch_id <> destination_branch_id),
  foreign key (org_id, student_id)
    references public.education_students(org_id, id) on delete restrict,
  foreign key (org_id, source_branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, destination_branch_id)
    references public.business_locations(org_id, id) on delete restrict
);
create index if not exists education_student_transfers_org_status_idx
  on public.education_student_transfers (org_id, status, created_at desc);

create or replace function public.education_validate_student_transfer_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.education_students student
    where student.org_id = new.org_id
      and student.id = new.student_id
      and student.branch_id = new.source_branch_id
  ) then
    raise exception 'The transfer source must match the student current branch.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists education_student_transfer_source_check
  on public.education_student_transfers;
create trigger education_student_transfer_source_check
  before insert or update of student_id, source_branch_id
  on public.education_student_transfers
  for each row execute function public.education_validate_student_transfer_source();

revoke all on function public.education_validate_student_transfer_source() from public, anon, authenticated;

create or replace function public.education_protect_workflow_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  required_action text := 'edit';
  module_name text;
begin
  if tg_op = 'INSERT' then
    if (tg_table_name = 'education_admissions' and new.status <> 'pending')
      or (tg_table_name = 'education_examinations' and new.status <> 'draft')
      or (tg_table_name = 'education_results' and new.status <> 'draft')
      or (tg_table_name = 'education_student_transfers' and new.status <> 'pending') then
      raise exception 'Education workflows must be created in their initial state.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  module_name := case tg_table_name
    when 'education_admissions' then 'education_admissions'
    when 'education_results' then 'education_results'
    when 'education_examinations' then 'education_examinations'
    else 'education_transfers'
  end;

  if new.status is distinct from old.status then
    if tg_table_name = 'education_admissions'
      and not (
        (old.status = 'pending' and new.status = 'under_review')
        or (old.status = 'under_review' and new.status in ('admitted', 'rejected'))
        or (old.status = 'admitted' and new.status = 'enrolled')
      ) then
      raise exception 'Admission status transition is not allowed.'
        using errcode = '22023';
    elsif tg_table_name = 'education_examinations'
      and not (
        (old.status = 'draft' and new.status in ('scheduled', 'cancelled'))
        or (old.status = 'scheduled' and new.status in ('in_progress', 'cancelled'))
        or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
        or (old.status = 'completed' and new.status = 'results_pending')
        or (old.status = 'results_pending' and new.status = 'published')
      ) then
      raise exception 'Examination status transition is not allowed.'
        using errcode = '22023';
    elsif tg_table_name = 'education_results'
      and not (
        (old.status = 'draft' and new.status = 'submitted')
        or (old.status = 'submitted' and new.status = 'approved')
        or (old.status = 'approved' and new.status = 'published')
      ) then
      raise exception 'Result status transition is not allowed.'
        using errcode = '22023';
    elsif tg_table_name = 'education_student_transfers'
      and not (
        (old.status = 'pending' and new.status in ('approved', 'rejected'))
        or (old.status = 'approved' and new.status = 'completed')
      ) then
      raise exception 'Student transfer status transition is not allowed.'
        using errcode = '22023';
    end if;

    if tg_table_name = 'education_examinations' and new.status = 'published' then
      if not exists (
        select 1
        from public.education_results result
        where result.org_id = old.org_id
          and result.examination_id = old.id
      ) or exists (
        select 1
        from public.education_results result
        where result.org_id = old.org_id
          and result.examination_id = old.id
          and result.status <> 'published'
      ) then
        raise exception 'An examination can only be published after all of its results are published.'
          using errcode = '42501';
      end if;
    end if;

    if tg_table_name = 'education_admissions' and new.status in ('admitted', 'rejected', 'enrolled') then
      required_action := 'approve';
    elsif tg_table_name = 'education_results' and new.status = 'approved' then
      required_action := 'approve';
    elsif new.status = 'published' then
      required_action := 'publish';
    elsif tg_table_name = 'education_student_transfers' and new.status in ('approved', 'rejected') then
      required_action := 'approve';
    elsif tg_table_name = 'education_student_transfers' and new.status = 'completed' then
      required_action := 'edit';
      if new.completed_at is null
        or not exists (
          select 1
          from public.education_students student
          where student.org_id = new.org_id
            and student.id = new.student_id
            and student.branch_id = new.destination_branch_id
        )
        or not exists (
          select 1
          from public.audit_logs log
          where log.org_id = new.org_id
            and log.entity_type = 'education_student_transfer'
            and log.entity_id = new.id
            and log.action = 'completed'
        ) then
        raise exception 'Transfers must be completed through the audited transfer workflow.'
          using errcode = '42501';
      end if;
    end if;

    if not public.has_org_product_permission(
      old.org_id, 'think-education', module_name, required_action
    ) then
      raise exception 'You do not have permission to change this education workflow status.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists education_admissions_transition_guard on public.education_admissions;
create trigger education_admissions_transition_guard
  before update of status on public.education_admissions
  for each row execute function public.education_protect_workflow_transitions();
drop trigger if exists education_admissions_initial_state_guard on public.education_admissions;
create trigger education_admissions_initial_state_guard
  before insert on public.education_admissions
  for each row execute function public.education_protect_workflow_transitions();
drop trigger if exists education_results_transition_guard on public.education_results;
create trigger education_results_transition_guard
  before update of status on public.education_results
  for each row execute function public.education_protect_workflow_transitions();
drop trigger if exists education_results_initial_state_guard on public.education_results;
create trigger education_results_initial_state_guard
  before insert on public.education_results
  for each row execute function public.education_protect_workflow_transitions();
drop trigger if exists education_examinations_transition_guard on public.education_examinations;
create trigger education_examinations_transition_guard
  before update of status on public.education_examinations
  for each row execute function public.education_protect_workflow_transitions();
drop trigger if exists education_examinations_initial_state_guard on public.education_examinations;
create trigger education_examinations_initial_state_guard
  before insert on public.education_examinations
  for each row execute function public.education_protect_workflow_transitions();
drop trigger if exists education_transfers_transition_guard on public.education_student_transfers;
create trigger education_transfers_transition_guard
  before update of status on public.education_student_transfers
  for each row execute function public.education_protect_workflow_transitions();
drop trigger if exists education_transfers_initial_state_guard on public.education_student_transfers;
create trigger education_transfers_initial_state_guard
  before insert on public.education_student_transfers
  for each row execute function public.education_protect_workflow_transitions();

revoke all on function public.education_protect_workflow_transitions() from public, anon, authenticated;

create or replace function public.education_user_has_branch_scope(
  target_org_id uuid,
  target_branch_id uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_org_member(target_org_id)
    and public.has_product_access(target_org_id, 'think-education', false)
    and exists (
      select 1
      from public.education_member_branch_scopes scope
      where scope.org_id = target_org_id
        and scope.user_id = auth.uid()
        and (
          (target_branch_id is null and scope.scope_type = 'organization')
          or (scope.scope_type = 'organization')
          or (scope.scope_type = 'branch' and scope.branch_id = target_branch_id)
        )
    );
$$;

create or replace function public.education_can_access_branch(
  target_org_id uuid,
  target_branch_id uuid,
  target_module text,
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.education_user_has_branch_scope(target_org_id, target_branch_id)
    and public.has_org_product_permission(
      target_org_id, 'think-education', target_module, target_action
    );
$$;

create or replace function public.education_can_access_organization(
  target_org_id uuid,
  target_module text,
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.education_user_has_branch_scope(target_org_id, null)
    and public.has_org_product_permission(
      target_org_id, 'think-education', target_module, target_action
    );
$$;

create or replace function public.education_user_has_any_branch_scope(
  target_org_id uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_org_member(target_org_id)
    and public.has_product_access(target_org_id, 'think-education', false)
    and exists (
      select 1
      from public.education_member_branch_scopes scope
      where scope.org_id = target_org_id
        and scope.user_id = auth.uid()
        and (scope.scope_type = 'organization' or scope.branch_id is not null)
    );
$$;

create or replace function public.education_set_academic_year_status(
  p_org_id uuid,
  p_academic_year_id uuid,
  p_status text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  academic_year public.education_academic_years%rowtype;
  required_action text;
begin
  if p_status is null or p_status not in ('active', 'completed') then
    raise exception 'Unsupported academic year status.'
      using errcode = '22023';
  end if;
  if not public.education_user_has_branch_scope(p_org_id, null) then
    raise exception 'Organization-wide Think Education access is required.'
      using errcode = '42501';
  end if;
  required_action := case when p_status = 'completed' then 'approve' else 'edit' end;
  if not public.has_org_product_permission(p_org_id, 'think-education', 'education_academics', required_action)
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_academics', 'edit') then
    raise exception 'You do not have permission to change the academic year status.'
      using errcode = '42501';
  end if;

  select * into academic_year
    from public.education_academic_years
    where org_id = p_org_id and id = p_academic_year_id
    for update;
  if not found then
    raise exception 'Academic year was not found.'
      using errcode = 'P0002';
  end if;
  if (p_status = 'active' and academic_year.status <> 'planned')
    or (p_status = 'completed' and academic_year.status <> 'active') then
    raise exception 'Academic year status transition is not allowed.'
      using errcode = '22023';
  end if;

  if p_status = 'active' then
    update public.education_academic_years
      set is_current = false
      where org_id = p_org_id and is_current;
    update public.education_academic_years
      set status = 'active', is_current = true, updated_at = now(), updated_by = auth.uid()
      where org_id = p_org_id and id = p_academic_year_id;
  else
    update public.education_academic_years
      set status = 'completed', is_current = false, updated_at = now(), updated_by = auth.uid()
      where org_id = p_org_id and id = p_academic_year_id;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), p_status, 'education_academic_year', p_academic_year_id,
    jsonb_build_object('previous_status', academic_year.status, 'is_current', p_status = 'active')
  );
  return p_academic_year_id;
end;
$$;

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
    or nullif(trim(p_subject_name), '') is null
    or length(trim(p_subject_name)) > 120
    or length(coalesce(trim(p_room), '')) > 80 then
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
        or (nullif(trim(p_room), '') is not null and lower(entry.room) = lower(trim(p_room)))
      )
  ) then
    raise exception 'The class, staff member, or room already has a timetable entry during that time.'
      using errcode = '23P01';
  end if;

  insert into public.education_timetable_entries (
    org_id, branch_id, class_id, staff_id, academic_year_id, subject_name,
    weekday, starts_at, ends_at, room, created_by
  ) values (
    p_org_id, p_branch_id, p_class_id, p_staff_id, p_academic_year_id, trim(p_subject_name),
    p_weekday, p_starts_at, p_ends_at, nullif(trim(p_room), ''), auth.uid()
  ) returning id into created_entry_id;
  return created_entry_id;
end;
$$;

create or replace function public.education_promote_student(
  p_org_id uuid,
  p_student_id uuid,
  p_source_enrollment_id uuid,
  p_destination_class_id uuid,
  p_action text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_enrollment public.education_student_enrollments%rowtype;
  source_class public.education_classes%rowtype;
  destination_class public.education_classes%rowtype;
  source_year public.education_academic_years%rowtype;
  destination_year public.education_academic_years%rowtype;
  student_row public.education_students%rowtype;
begin
  if p_action is null or p_action not in ('promote', 'graduate') then
    raise exception 'Unsupported student progression action.'
      using errcode = '22023';
  end if;

  select * into source_enrollment
    from public.education_student_enrollments
    where org_id = p_org_id
      and id = p_source_enrollment_id
      and student_id = p_student_id
      and status = 'active'
    for update;
  if not found then
    raise exception 'The active source enrollment was not found.'
      using errcode = 'P0002';
  end if;
  select * into student_row
    from public.education_students
    where org_id = p_org_id and id = p_student_id
    for update;
  select * into source_class
    from public.education_classes
    where org_id = p_org_id and id = source_enrollment.class_id;
  select * into source_year
    from public.education_academic_years
    where org_id = p_org_id and id = source_enrollment.academic_year_id;

  if not public.education_user_has_branch_scope(p_org_id, source_enrollment.branch_id)
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_promotion', 'edit')
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_promotion', 'approve') then
    raise exception 'You are not authorized to process student progression for this campus.'
      using errcode = '42501';
  end if;
  if not found then
    raise exception 'The student or source class was not found.'
      using errcode = 'P0002';
  end if;
  if student_row.status <> 'active' or source_class.status <> 'active' then
    raise exception 'Only active students in active classes can be progressed.'
      using errcode = '22023';
  end if;
  if source_year.status <> 'completed' then
    raise exception 'Student progression is available only after the source academic year is completed.'
      using errcode = '22023';
  end if;

  if p_action = 'graduate' then
    update public.education_student_enrollments
      set status = 'completed', ended_on = current_date
      where org_id = p_org_id and id = source_enrollment.id;
    update public.education_students
      set status = 'graduated', updated_at = now()
      where org_id = p_org_id and id = p_student_id;
    insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      p_org_id, auth.uid(), 'graduated', 'education_student', p_student_id,
      jsonb_build_object(
        'source_branch_id', source_enrollment.branch_id,
        'source_class_id', source_enrollment.class_id,
        'academic_year_id', source_enrollment.academic_year_id
      )
    );
    return p_student_id;
  end if;

  select * into destination_class
    from public.education_classes
    where org_id = p_org_id
      and id = p_destination_class_id
      and branch_id = source_enrollment.branch_id
      and status = 'active';
  if not found then
    raise exception 'Select an active class in a different academic year at the same campus.'
      using errcode = '22023';
  end if;
  select * into destination_year
    from public.education_academic_years
    where org_id = p_org_id and id = destination_class.academic_year_id;
  if destination_class.academic_year_id = source_enrollment.academic_year_id
    or destination_year.status not in ('planned', 'active') then
    raise exception 'Select an active class in a different academic year at the same campus.'
      using errcode = '22023';
  end if;
  if not public.has_org_product_permission(p_org_id, 'think-education', 'education_promotion', 'create') then
    raise exception 'You do not have permission to enroll students in the destination class.'
      using errcode = '42501';
  end if;

  update public.education_student_enrollments
    set status = 'completed', ended_on = current_date
    where org_id = p_org_id and id = source_enrollment.id;
  insert into public.education_student_enrollments (
    org_id, branch_id, student_id, class_id, academic_year_id, status, enrolled_on
  ) values (
    p_org_id, source_enrollment.branch_id, p_student_id, destination_class.id,
    destination_class.academic_year_id, 'active', current_date
  );
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'promoted', 'education_student', p_student_id,
    jsonb_build_object(
      'source_class_id', source_class.id,
      'destination_class_id', destination_class.id,
      'source_academic_year_id', source_enrollment.academic_year_id,
      'destination_academic_year_id', destination_class.academic_year_id
    )
  );
  return p_student_id;
end;
$$;

create or replace function public.education_transition_student_transfer(
  p_transfer_id uuid,
  p_status text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_row public.education_student_transfers%rowtype;
  required_action text;
  audit_action text;
begin
  if p_status is null or p_status not in ('approved', 'rejected', 'completed') then
    raise exception 'Unsupported student transfer status.'
      using errcode = '22023';
  end if;

  select *
    into transfer_row
    from public.education_student_transfers
    where id = p_transfer_id
    for update;
  if not found then
    raise exception 'Student transfer was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_user_has_branch_scope(transfer_row.org_id, transfer_row.source_branch_id)
    or not public.education_user_has_branch_scope(transfer_row.org_id, transfer_row.destination_branch_id) then
    raise exception 'You must have assigned access to both campuses to process this transfer.'
      using errcode = '42501';
  end if;

  required_action := case when p_status in ('approved', 'rejected') then 'approve' else 'edit' end;
  if not public.has_org_product_permission(
    transfer_row.org_id, 'think-education', 'education_transfers', required_action
  ) or not public.has_org_product_permission(
    transfer_row.org_id, 'think-education', 'education_transfers', 'edit'
  ) then
    raise exception 'You do not have permission to process this student transfer.'
      using errcode = '42501';
  end if;

  if p_status in ('approved', 'rejected') then
    if transfer_row.status <> 'pending' then
      raise exception 'Only pending transfers can be approved or rejected.'
        using errcode = '22023';
    end if;
    update public.education_student_transfers
      set status = p_status, approved_by = auth.uid()
      where id = p_transfer_id;
    audit_action := p_status;
    insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      transfer_row.org_id, auth.uid(), audit_action, 'education_student_transfer', p_transfer_id,
      jsonb_build_object(
        'student_id', transfer_row.student_id,
        'source_branch_id', transfer_row.source_branch_id,
        'destination_branch_id', transfer_row.destination_branch_id
      )
    );
    return p_transfer_id;
  end if;

  if transfer_row.status <> 'approved' then
    raise exception 'Only approved transfers can be completed.'
      using errcode = '22023';
  end if;
  if transfer_row.effective_on > current_date then
    raise exception 'A student transfer cannot be completed before its effective date.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.business_locations location
    join public.education_campuses campus
      on campus.org_id = location.org_id and campus.branch_id = location.id
    where location.org_id = transfer_row.org_id
      and location.id = transfer_row.destination_branch_id
      and location.is_active
      and campus.status = 'active'
  ) then
    raise exception 'The destination campus is not active.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_students student
    where student.org_id = transfer_row.org_id
      and student.id = transfer_row.student_id
      and student.branch_id = transfer_row.source_branch_id
  ) then
    raise exception 'The student is no longer enrolled at the transfer source campus.'
      using errcode = '23514';
  end if;

  update public.education_student_enrollments
    set status = 'transferred', ended_on = current_date
    where org_id = transfer_row.org_id
      and student_id = transfer_row.student_id
      and branch_id = transfer_row.source_branch_id
      and status = 'active';
  update public.education_students
    set branch_id = transfer_row.destination_branch_id,
        updated_at = now()
    where org_id = transfer_row.org_id
      and id = transfer_row.student_id
      and branch_id = transfer_row.source_branch_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    transfer_row.org_id, auth.uid(), 'completed', 'education_student_transfer', p_transfer_id,
    jsonb_build_object(
      'student_id', transfer_row.student_id,
      'source_branch_id', transfer_row.source_branch_id,
      'destination_branch_id', transfer_row.destination_branch_id,
      'effective_on', transfer_row.effective_on
    )
  );
  update public.education_student_transfers
    set status = 'completed', completed_at = now()
    where id = p_transfer_id;
  return p_transfer_id;
end;
$$;

create or replace function public.education_create_campus(
  p_org_id uuid,
  p_name text,
  p_code text,
  p_address text default null,
  p_city text default null,
  p_region text default null,
  p_country text default null,
  p_phone text default null,
  p_email text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_branch_id uuid;
begin
  if not public.education_user_has_branch_scope(p_org_id, null)
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_organization', 'create') then
    raise exception 'You are not authorized to create a Think Education campus.'
      using errcode = '42501';
  end if;

  if nullif(trim(p_name), '') is null
    or nullif(trim(p_code), '') is null
    or length(trim(p_name)) > 120
    or length(trim(p_code)) > 32 then
    raise exception 'Campus name and code are required and must be within the supported lengths.'
      using errcode = '22023';
  end if;

  insert into public.business_locations (
    org_id, name, code, location_type, address, city, region, country, phone,
    email, is_primary, is_active, created_by
  ) values (
    p_org_id, trim(p_name), upper(trim(p_code)), 'branch', nullif(trim(p_address), ''),
    nullif(trim(p_city), ''), nullif(trim(p_region), ''), nullif(trim(p_country), ''),
    nullif(trim(p_phone), ''), nullif(trim(p_email), ''), false, true, auth.uid()
  )
  returning id into created_branch_id;

  insert into public.education_campuses (org_id, branch_id, status)
  values (p_org_id, created_branch_id, 'active');

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    'created',
    'education_campus',
    created_branch_id,
    jsonb_build_object('name', trim(p_name), 'code', upper(trim(p_code)))
  );
  return created_branch_id;
end;
$$;

revoke all on function public.education_user_has_branch_scope(uuid, uuid) from public, anon;
revoke all on function public.education_can_access_branch(uuid, uuid, text, text) from public, anon;
revoke all on function public.education_can_access_organization(uuid, text, text) from public, anon;
revoke all on function public.education_user_has_any_branch_scope(uuid) from public, anon;
revoke all on function public.education_set_academic_year_status(uuid, uuid, text) from public, anon;
revoke all on function public.education_create_timetable_entry(uuid, uuid, uuid, uuid, uuid, text, smallint, time, time, text)
  from public, anon;
revoke all on function public.education_promote_student(uuid, uuid, uuid, uuid, text)
  from public, anon;
revoke all on function public.education_transition_student_transfer(uuid, text) from public, anon;
revoke all on function public.education_create_campus(uuid, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.education_user_has_branch_scope(uuid, uuid) to authenticated;
grant execute on function public.education_can_access_branch(uuid, uuid, text, text) to authenticated;
grant execute on function public.education_can_access_organization(uuid, text, text) to authenticated;
grant execute on function public.education_user_has_any_branch_scope(uuid) to authenticated;
grant execute on function public.education_set_academic_year_status(uuid, uuid, text) to authenticated;
grant execute on function public.education_create_timetable_entry(uuid, uuid, uuid, uuid, uuid, text, smallint, time, time, text)
  to authenticated;
grant execute on function public.education_promote_student(uuid, uuid, uuid, uuid, text)
  to authenticated;
grant execute on function public.education_transition_student_transfer(uuid, text) to authenticated;
grant execute on function public.education_create_campus(uuid, text, text, text, text, text, text, text, text)
  to authenticated;

alter table public.education_member_branch_scopes enable row level security;
alter table public.education_institution_settings enable row level security;
alter table public.education_campuses enable row level security;
alter table public.education_academic_years enable row level security;
alter table public.education_academic_terms enable row level security;
alter table public.education_departments enable row level security;
alter table public.education_students enable row level security;
alter table public.education_staff enable row level security;
alter table public.education_classes enable row level security;
alter table public.education_timetable_entries enable row level security;
alter table public.education_student_enrollments enable row level security;
alter table public.education_admissions enable row level security;
alter table public.education_attendance enable row level security;
alter table public.education_examinations enable row level security;
alter table public.education_results enable row level security;
alter table public.education_student_transfers enable row level security;

create policy "education members read own branch scopes"
  on public.education_member_branch_scopes for select
  using (
    user_id = auth.uid()
    and public.is_org_member(org_id)
    and public.has_product_access(org_id, 'think-education', false)
    and (
      public.is_org_product_admin(org_id)
      or exists (
        select 1
        from public.organization_product_access_assignments assignment
        where assignment.org_id = education_member_branch_scopes.org_id
          and assignment.user_id = auth.uid()
          and assignment.product_slug = 'think-education'
          and assignment.is_active
      )
    )
  );
create policy "education administrators read branch scopes"
  on public.education_member_branch_scopes for select
  using (public.has_org_product_permission(org_id, 'think-education', 'education_user_management', 'view'));
create policy "education administrators grant branch scopes"
  on public.education_member_branch_scopes for insert
  with check (
    public.is_org_product_admin(org_id)
    or (
      public.has_org_product_permission(org_id, 'think-education', 'education_user_management', 'edit')
      and (
        (scope_type = 'branch' and public.education_user_has_branch_scope(org_id, branch_id))
        or (scope_type = 'organization' and public.education_user_has_branch_scope(org_id, null))
      )
    )
  );
create policy "education administrators update branch scopes"
  on public.education_member_branch_scopes for update
  using (
    public.is_org_product_admin(org_id)
    or (
      public.has_org_product_permission(org_id, 'think-education', 'education_user_management', 'edit')
      and public.education_user_has_branch_scope(org_id, branch_id)
    )
  )
  with check (
    public.is_org_product_admin(org_id)
    or (
      public.has_org_product_permission(org_id, 'think-education', 'education_user_management', 'edit')
      and (
        (scope_type = 'branch' and public.education_user_has_branch_scope(org_id, branch_id))
        or (scope_type = 'organization' and public.education_user_has_branch_scope(org_id, null))
      )
    )
  );
create policy "education administrators revoke branch scopes"
  on public.education_member_branch_scopes for delete
  using (
    public.is_org_product_admin(org_id)
    or (
      scope_type = 'branch'
      and public.has_org_product_permission(org_id, 'think-education', 'education_user_management', 'edit')
      and public.education_user_has_branch_scope(org_id, branch_id)
    )
  );

create or replace function public.education_audit_branch_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scope_row public.education_member_branch_scopes;
  scope_action text;
begin
  if tg_op = 'DELETE' then
    scope_row := old;
    scope_action := 'revoked';
  else
    scope_row := new;
    scope_action := case when tg_op = 'INSERT' then 'granted' else 'updated' end;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    scope_row.org_id,
    auth.uid(),
    scope_action,
    'education_branch_scope',
    scope_row.branch_id,
    jsonb_build_object(
      'user_id', scope_row.user_id,
      'scope_type', scope_row.scope_type,
      'branch_id', scope_row.branch_id
    )
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists education_branch_scope_audit_trigger
  on public.education_member_branch_scopes;
create trigger education_branch_scope_audit_trigger
  after insert or update or delete on public.education_member_branch_scopes
  for each row execute function public.education_audit_branch_scope_change();

revoke all on function public.education_audit_branch_scope_change() from public, anon, authenticated;

create policy "education institution settings read"
  on public.education_institution_settings for select
  using (public.education_can_access_organization(org_id, 'education_settings', 'view'));
create policy "education institution settings create"
  on public.education_institution_settings for insert
  with check (public.education_can_access_organization(org_id, 'education_settings', 'create'));
create policy "education institution settings update"
  on public.education_institution_settings for update
  using (public.education_can_access_organization(org_id, 'education_settings', 'edit'))
  with check (public.education_can_access_organization(org_id, 'education_settings', 'edit'));

create policy "education campuses read"
  on public.education_campuses for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_organization', 'view'));
create policy "education campuses create"
  on public.education_campuses for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_organization', 'create'));
create policy "education campuses update"
  on public.education_campuses for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_organization', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_organization', 'edit'));

create policy "education academic years read"
  on public.education_academic_years for select
  using (
    public.education_user_has_any_branch_scope(org_id)
    and public.has_org_product_permission(org_id, 'think-education', 'education_academics', 'view')
  );
create policy "education academic years create"
  on public.education_academic_years for insert
  with check (public.education_can_access_organization(org_id, 'education_academics', 'create'));
create policy "education academic years update"
  on public.education_academic_years for update
  using (public.education_can_access_organization(org_id, 'education_academics', 'edit'))
  with check (public.education_can_access_organization(org_id, 'education_academics', 'edit'));

create policy "education academic terms read"
  on public.education_academic_terms for select
  using (
    public.education_user_has_any_branch_scope(org_id)
    and public.has_org_product_permission(org_id, 'think-education', 'education_academics', 'view')
  );
create policy "education academic terms create"
  on public.education_academic_terms for insert
  with check (public.education_can_access_organization(org_id, 'education_academics', 'create'));
create policy "education academic terms update"
  on public.education_academic_terms for update
  using (public.education_can_access_organization(org_id, 'education_academics', 'edit'))
  with check (public.education_can_access_organization(org_id, 'education_academics', 'edit'));

create policy "education departments read"
  on public.education_departments for select
  using (
    (branch_id is null and public.education_can_access_organization(org_id, 'education_academics', 'view'))
    or (branch_id is not null and public.education_can_access_branch(org_id, branch_id, 'education_academics', 'view'))
  );
create policy "education departments create"
  on public.education_departments for insert
  with check (
    (branch_id is null and public.education_can_access_organization(org_id, 'education_academics', 'create'))
    or (branch_id is not null and public.education_can_access_branch(org_id, branch_id, 'education_academics', 'create'))
  );
create policy "education departments update"
  on public.education_departments for update
  using (
    (branch_id is null and public.education_can_access_organization(org_id, 'education_academics', 'edit'))
    or (branch_id is not null and public.education_can_access_branch(org_id, branch_id, 'education_academics', 'edit'))
  )
  with check (
    (branch_id is null and public.education_can_access_organization(org_id, 'education_academics', 'edit'))
    or (branch_id is not null and public.education_can_access_branch(org_id, branch_id, 'education_academics', 'edit'))
  );

create policy "education students read"
  on public.education_students for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_students', 'view'));
create policy "education students create"
  on public.education_students for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_students', 'create'));
create policy "education students update"
  on public.education_students for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_students', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_students', 'edit'));

create policy "education staff read"
  on public.education_staff for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_staff', 'view'));
create policy "education staff create"
  on public.education_staff for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_staff', 'create'));
create policy "education staff update"
  on public.education_staff for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_staff', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_staff', 'edit'));

create policy "education classes read"
  on public.education_classes for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_academics', 'view'));
create policy "education classes create"
  on public.education_classes for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_academics', 'create'));
create policy "education classes update"
  on public.education_classes for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_academics', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_academics', 'edit'));

create policy "education timetable entries read"
  on public.education_timetable_entries for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_timetables', 'view'));
create policy "education timetable entries create"
  on public.education_timetable_entries for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_timetables', 'create'));

create policy "education enrollments read"
  on public.education_student_enrollments for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_students', 'view'));
create policy "education enrollments create"
  on public.education_student_enrollments for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_students', 'edit'));
create policy "education enrollments update"
  on public.education_student_enrollments for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_students', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_students', 'edit'));

create policy "education admissions read"
  on public.education_admissions for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_admissions', 'view'));
create policy "education admissions create"
  on public.education_admissions for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_admissions', 'create'));
create policy "education admissions update"
  on public.education_admissions for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_admissions', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_admissions', 'edit'));

create policy "education attendance read"
  on public.education_attendance for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_attendance', 'view'));
create policy "education attendance create"
  on public.education_attendance for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_attendance', 'create'));
create policy "education attendance update"
  on public.education_attendance for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_attendance', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_attendance', 'edit'));

create policy "education examinations read"
  on public.education_examinations for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_examinations', 'view'));
create policy "education examinations create"
  on public.education_examinations for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_examinations', 'create'));
create policy "education examinations update"
  on public.education_examinations for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_examinations', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_examinations', 'edit'));

create policy "education results read"
  on public.education_results for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_results', 'view'));
create policy "education results create"
  on public.education_results for insert
  with check (public.education_can_access_branch(org_id, branch_id, 'education_results', 'create'));
create policy "education results update"
  on public.education_results for update
  using (public.education_can_access_branch(org_id, branch_id, 'education_results', 'edit'))
  with check (public.education_can_access_branch(org_id, branch_id, 'education_results', 'edit'));

create policy "education transfers read"
  on public.education_student_transfers for select
  using (
    public.education_can_access_branch(org_id, source_branch_id, 'education_transfers', 'view')
    and public.education_can_access_branch(org_id, destination_branch_id, 'education_transfers', 'view')
  );
create policy "education transfers create"
  on public.education_student_transfers for insert
  with check (
    public.education_can_access_branch(org_id, source_branch_id, 'education_transfers', 'create')
    and public.education_can_access_branch(org_id, destination_branch_id, 'education_transfers', 'create')
  );
create policy "education transfers update"
  on public.education_student_transfers for update
  using (
    public.education_can_access_branch(org_id, source_branch_id, 'education_transfers', 'edit')
    and public.education_can_access_branch(org_id, destination_branch_id, 'education_transfers', 'edit')
  )
  with check (
    public.education_can_access_branch(org_id, source_branch_id, 'education_transfers', 'edit')
    and public.education_can_access_branch(org_id, destination_branch_id, 'education_transfers', 'edit')
  );

grant select, insert, update, delete on public.education_member_branch_scopes to authenticated;
grant select, insert, update on public.education_institution_settings to authenticated;
grant select, insert, update on public.education_campuses to authenticated;
grant select, update on public.education_academic_years to authenticated;
revoke insert on public.education_academic_years from authenticated;
grant insert (org_id, name, starts_on, ends_on) on public.education_academic_years to authenticated;
revoke update on public.education_academic_years from authenticated;
grant update (name, starts_on, ends_on, updated_at) on public.education_academic_years to authenticated;
grant select, insert, update on public.education_academic_terms to authenticated;
grant select, insert, update on public.education_departments to authenticated;
grant select, insert, update on public.education_students to authenticated;
revoke update on public.education_students from authenticated;
grant update (
  student_number, first_name, last_name, other_names, email, phone, date_of_birth,
  gender, status, updated_at
) on public.education_students to authenticated;
grant select, insert, update on public.education_staff to authenticated;
grant select, insert, update on public.education_classes to authenticated;
grant select, insert on public.education_timetable_entries to authenticated;
grant select, insert, update on public.education_student_enrollments to authenticated;
grant select, insert, update on public.education_admissions to authenticated;
grant select, insert, update on public.education_attendance to authenticated;
grant select, insert, update on public.education_examinations to authenticated;
grant select, insert, update on public.education_results to authenticated;
grant select, insert on public.education_student_transfers to authenticated;
revoke update on public.education_student_transfers from authenticated;

revoke all on public.education_member_branch_scopes from anon;
revoke all on public.education_institution_settings from anon;
revoke all on public.education_campuses from anon;
revoke all on public.education_academic_years from anon;
revoke all on public.education_academic_terms from anon;
revoke all on public.education_departments from anon;
revoke all on public.education_students from anon;
revoke all on public.education_staff from anon;
revoke all on public.education_classes from anon;
revoke all on public.education_timetable_entries from anon;
revoke all on public.education_student_enrollments from anon;
revoke all on public.education_admissions from anon;
revoke all on public.education_attendance from anon;
revoke all on public.education_examinations from anon;
revoke all on public.education_results from anon;
revoke all on public.education_student_transfers from anon;
