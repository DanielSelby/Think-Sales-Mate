begin;

create table if not exists public.education_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  academic_year_id uuid not null,
  timetable_entry_id uuid not null,
  class_id uuid not null,
  subject_name text not null,
  planned_date date not null,
  topic text not null check (char_length(btrim(topic)) between 1 and 240),
  objectives text not null check (char_length(btrim(objectives)) between 1 and 2000),
  teaching_materials text,
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  prepared_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, timetable_entry_id)
    references public.education_timetable_entries(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete restrict,
  unique (org_id, timetable_entry_id, planned_date)
);

create table if not exists public.education_lesson_log_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  lesson_plan_id uuid not null,
  timetable_entry_id uuid not null,
  class_id uuid not null,
  subject_name text not null,
  delivered_on date not null,
  topic_covered text not null check (char_length(btrim(topic_covered)) between 1 and 240),
  syllabus_section text,
  teacher_remarks text,
  status text not null default 'submitted' check (status in ('submitted', 'reviewed')),
  delivered_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  supervisor_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, lesson_plan_id)
    references public.education_lesson_plans(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, timetable_entry_id)
    references public.education_timetable_entries(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete restrict,
  unique (org_id, lesson_plan_id)
);

create index if not exists education_lesson_plans_lookup_idx
  on public.education_lesson_plans (org_id, branch_id, planned_date desc, class_id);
create index if not exists education_lesson_log_lookup_idx
  on public.education_lesson_log_entries (org_id, branch_id, delivered_on desc, class_id);

alter table public.education_lesson_plans enable row level security;
alter table public.education_lesson_log_entries enable row level security;
revoke all on public.education_lesson_plans from public, anon, authenticated;
revoke all on public.education_lesson_log_entries from public, anon, authenticated;

create or replace function public.education_save_lesson_plan(
  p_org_id uuid,
  p_branch_id uuid,
  p_timetable_entry_id uuid,
  p_planned_date date,
  p_topic text,
  p_objectives text,
  p_teaching_materials text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  lesson public.education_timetable_entries%rowtype;
  plan_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_timetable_entry_id is null or p_planned_date is null
    or char_length(btrim(coalesce(p_topic, ''))) not between 1 and 240
    or char_length(btrim(coalesce(p_objectives, ''))) not between 1 and 2000
    or char_length(coalesce(p_teaching_materials, '')) > 2000 then
    raise exception 'Lesson plan details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_timetables', 'edit') then
    raise exception 'You do not have permission to plan lessons.' using errcode = '42501';
  end if;

  select * into lesson
  from public.education_timetable_entries
  where org_id = p_org_id
    and branch_id = p_branch_id
    and id = p_timetable_entry_id
    and status = 'active';
  if not found then
    raise exception 'The active timetable lesson was not found.' using errcode = 'P0002';
  end if;
  if extract(isodow from p_planned_date)::smallint <> lesson.weekday then
    raise exception 'The plan date must match the timetable weekday.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.education_lesson_plans plan
    where plan.org_id = p_org_id
      and plan.timetable_entry_id = p_timetable_entry_id
      and plan.planned_date = p_planned_date
      and plan.status in ('completed', 'cancelled')
  ) then
    raise exception 'Completed or cancelled lesson plans cannot be changed.' using errcode = '22023';
  end if;

  insert into public.education_lesson_plans (
    org_id, branch_id, academic_year_id, timetable_entry_id, class_id,
    subject_name, planned_date, topic, objectives, teaching_materials,
    status, prepared_by, updated_at
  ) values (
    p_org_id, p_branch_id, lesson.academic_year_id, lesson.id, lesson.class_id,
    lesson.subject_name, p_planned_date, btrim(p_topic), btrim(p_objectives),
    nullif(btrim(p_teaching_materials), ''), 'planned', auth.uid(), now()
  )
  on conflict (org_id, timetable_entry_id, planned_date)
  do update set
    topic = excluded.topic,
    objectives = excluded.objectives,
    teaching_materials = excluded.teaching_materials,
    prepared_by = auth.uid(),
    updated_at = now()
  returning id into plan_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_lesson_plan_saved',
    'education_lesson_plan', plan_id,
    jsonb_build_object('timetable_entry_id', p_timetable_entry_id, 'planned_date', p_planned_date)
  );
  return plan_id;
end;
$$;

revoke all on function public.education_save_lesson_plan(uuid, uuid, uuid, date, text, text, text) from public, anon;
grant execute on function public.education_save_lesson_plan(uuid, uuid, uuid, date, text, text, text) to authenticated;

create or replace function public.education_submit_lesson_log(
  p_org_id uuid,
  p_lesson_plan_id uuid,
  p_topic_covered text,
  p_syllabus_section text,
  p_teacher_remarks text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  plan public.education_lesson_plans%rowtype;
  log_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_lesson_plan_id is null
    or char_length(btrim(coalesce(p_topic_covered, ''))) not between 1 and 240
    or char_length(coalesce(p_syllabus_section, '')) > 240
    or char_length(coalesce(p_teacher_remarks, '')) > 2000 then
    raise exception 'Lesson log details are invalid.' using errcode = '22023';
  end if;
  select * into plan
  from public.education_lesson_plans
  where org_id = p_org_id and id = p_lesson_plan_id
  for update;
  if not found then
    raise exception 'The lesson plan was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, plan.branch_id, 'education_timetables', 'edit') then
    raise exception 'You do not have permission to submit this lesson log.' using errcode = '42501';
  end if;

  insert into public.education_lesson_log_entries (
    org_id, branch_id, lesson_plan_id, timetable_entry_id, class_id,
    subject_name, delivered_on, topic_covered, syllabus_section,
    teacher_remarks, status, delivered_by, created_at, updated_at
  ) values (
    p_org_id, plan.branch_id, plan.id, plan.timetable_entry_id, plan.class_id,
    plan.subject_name, plan.planned_date, btrim(p_topic_covered),
    nullif(btrim(p_syllabus_section), ''), nullif(btrim(p_teacher_remarks), ''),
    'submitted', auth.uid(), now(), now()
  )
  on conflict (org_id, lesson_plan_id)
  do update set
    topic_covered = excluded.topic_covered,
    syllabus_section = excluded.syllabus_section,
    teacher_remarks = excluded.teacher_remarks,
    status = 'submitted',
    delivered_by = auth.uid(),
    reviewed_by = null,
    reviewed_at = null,
    supervisor_remarks = null,
    updated_at = now()
  returning id into log_id;

  update public.education_lesson_plans
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = plan.id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_lesson_log_submitted',
    'education_lesson_log', log_id,
    jsonb_build_object('lesson_plan_id', plan.id, 'delivered_on', plan.planned_date)
  );
  return log_id;
end;
$$;

revoke all on function public.education_submit_lesson_log(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.education_submit_lesson_log(uuid, uuid, text, text, text) to authenticated;

create or replace function public.education_review_lesson_log(
  p_org_id uuid,
  p_log_id uuid,
  p_supervisor_remarks text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  log public.education_lesson_log_entries%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_log_id is null
    or char_length(coalesce(p_supervisor_remarks, '')) > 2000 then
    raise exception 'Supervisor review details are invalid.' using errcode = '22023';
  end if;
  select * into log
  from public.education_lesson_log_entries
  where org_id = p_org_id and id = p_log_id
  for update;
  if not found then
    raise exception 'The lesson log was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, log.branch_id, 'education_timetables', 'approve') then
    raise exception 'Supervisor approval access is required.' using errcode = '42501';
  end if;

  update public.education_lesson_log_entries
  set status = 'reviewed',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      supervisor_remarks = nullif(btrim(p_supervisor_remarks), ''),
      updated_at = now()
  where id = log.id;
  return true;
end;
$$;

revoke all on function public.education_review_lesson_log(uuid, uuid, text) from public, anon;
grant execute on function public.education_review_lesson_log(uuid, uuid, text) to authenticated;

create or replace function public.education_get_lesson_planning_page(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_from date,
  p_to date
) returns table (
  plan_id uuid,
  branch_id uuid,
  timetable_entry_id uuid,
  class_id uuid,
  subject_name text,
  planned_date date,
  topic text,
  objectives text,
  teaching_materials text,
  plan_status text,
  log_id uuid,
  topic_covered text,
  syllabus_section text,
  teacher_remarks text,
  log_status text,
  delivered_on date,
  reviewed_at timestamptz,
  supervisor_remarks text
)
language sql
stable
set search_path = public
as $$
  select plan.id, plan.branch_id, plan.timetable_entry_id, plan.class_id,
         plan.subject_name, plan.planned_date, plan.topic, plan.objectives,
         plan.teaching_materials, plan.status,
         log.id, log.topic_covered, log.syllabus_section, log.teacher_remarks,
         log.status, log.delivered_on, log.reviewed_at, log.supervisor_remarks
  from public.education_lesson_plans plan
  left join public.education_lesson_log_entries log
    on log.org_id = plan.org_id
    and log.lesson_plan_id = plan.id
  where plan.org_id = p_org_id
    and plan.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
    and plan.planned_date between p_from and p_to
    and public.education_can_access_branch(p_org_id, plan.branch_id, 'education_timetables', 'view');
$$;

revoke all on function public.education_get_lesson_planning_page(uuid, uuid[], date, date) from public, anon;
grant execute on function public.education_get_lesson_planning_page(uuid, uuid[], date, date) to authenticated;

commit;
