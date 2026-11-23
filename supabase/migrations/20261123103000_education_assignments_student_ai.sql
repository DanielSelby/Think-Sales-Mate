begin;

create table if not exists public.education_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  class_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 10000),
  due_on date not null,
  max_score numeric(8, 2) not null default 100 check (max_score > 0 and max_score <= 10000),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, class_id)
    references public.education_classes(org_id, id) on delete cascade
);

create index if not exists education_assignments_teacher_class_idx
  on public.education_assignments (org_id, class_id, due_on desc);
create index if not exists education_assignments_published_due_idx
  on public.education_assignments (org_id, status, due_on);

create table if not exists public.education_assignment_targets (
  org_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (org_id, assignment_id, student_id),
  foreign key (org_id, assignment_id)
    references public.education_assignments(org_id, id) on delete cascade,
  foreign key (org_id, student_id)
    references public.education_students(org_id, id) on delete cascade
);

create index if not exists education_assignment_targets_student_idx
  on public.education_assignment_targets (org_id, student_id, assignment_id);

create table if not exists public.education_assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  submission_text text not null check (length(btrim(submission_text)) between 1 and 10000),
  submitted_at timestamptz not null default now(),
  score numeric(8, 2),
  feedback text,
  graded_by uuid references auth.users(id) on delete set null,
  graded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (org_id, assignment_id, student_id),
  foreign key (org_id, assignment_id, student_id)
    references public.education_assignment_targets(org_id, assignment_id, student_id) on delete cascade,
  check (score is null or score >= 0),
  check (feedback is null or length(feedback) <= 4000)
);

create index if not exists education_assignment_submissions_teacher_idx
  on public.education_assignment_submissions (org_id, assignment_id, submitted_at desc);

create or replace function public.education_current_teacher_can_access_class(
  p_org_id uuid,
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from jsonb_array_elements(coalesce(public.education_get_teacher_portal()::jsonb, '[]'::jsonb)) as teacher(value)
    cross join lateral jsonb_array_elements(coalesce(teacher.value->'classes', '[]'::jsonb)) as classroom(value)
    where teacher.value->>'organizationId' = p_org_id::text
      and classroom.value->>'id' = p_class_id::text
  );
$$;

create or replace function public.education_current_student_can_access(
  p_org_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from jsonb_array_elements(coalesce(public.education_get_student_portal()::jsonb, '[]'::jsonb)) as student(value)
    where student.value->>'organizationId' = p_org_id::text
      and student.value->>'id' = p_student_id::text
  );
$$;

create or replace function public.education_teacher_class_contains_student(
  p_org_id uuid,
  p_class_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from jsonb_array_elements(coalesce(public.education_get_teacher_portal()::jsonb, '[]'::jsonb)) as teacher(value)
    cross join lateral jsonb_array_elements(coalesce(teacher.value->'classes', '[]'::jsonb)) as classroom(value)
    cross join lateral jsonb_array_elements(coalesce(classroom.value->'students', '[]'::jsonb)) as student(value)
    where teacher.value->>'organizationId' = p_org_id::text
      and classroom.value->>'id' = p_class_id::text
      and student.value->>'id' = p_student_id::text
  );
$$;

revoke all on function public.education_current_teacher_can_access_class(uuid, uuid) from public, anon;
revoke all on function public.education_current_student_can_access(uuid, uuid) from public, anon;
revoke all on function public.education_teacher_class_contains_student(uuid, uuid, uuid) from public, anon;
grant execute on function public.education_current_teacher_can_access_class(uuid, uuid) to authenticated;
grant execute on function public.education_current_student_can_access(uuid, uuid) to authenticated;
grant execute on function public.education_teacher_class_contains_student(uuid, uuid, uuid) to authenticated;

alter table public.education_assignments enable row level security;
alter table public.education_assignment_targets enable row level security;
alter table public.education_assignment_submissions enable row level security;

drop policy if exists "education assignments authorized reads" on public.education_assignments;
create policy "education assignments authorized reads"
  on public.education_assignments for select to authenticated
  using (
    public.education_current_teacher_can_access_class(org_id, class_id)
    or (
      status = 'published'
      and exists (
        select 1 from public.education_assignment_targets as target
        where target.org_id = education_assignments.org_id
          and target.assignment_id = education_assignments.id
          and public.education_current_student_can_access(target.org_id, target.student_id)
      )
    )
  );

drop policy if exists "education assignment targets authorized reads" on public.education_assignment_targets;
create policy "education assignment targets authorized reads"
  on public.education_assignment_targets for select to authenticated
  using (
    public.education_current_student_can_access(org_id, student_id)
    or exists (
      select 1 from public.education_assignments as assignment
      where assignment.org_id = education_assignment_targets.org_id
        and assignment.id = education_assignment_targets.assignment_id
        and public.education_current_teacher_can_access_class(assignment.org_id, assignment.class_id)
    )
  );

drop policy if exists "education assignment submissions authorized reads" on public.education_assignment_submissions;
create policy "education assignment submissions authorized reads"
  on public.education_assignment_submissions for select to authenticated
  using (
    public.education_current_student_can_access(org_id, student_id)
    or exists (
      select 1
      from public.education_assignments as assignment
      where assignment.org_id = education_assignment_submissions.org_id
        and assignment.id = education_assignment_submissions.assignment_id
        and public.education_current_teacher_can_access_class(assignment.org_id, assignment.class_id)
    )
  );

revoke all on public.education_assignments, public.education_assignment_targets,
  public.education_assignment_submissions from anon, authenticated;
grant select on public.education_assignments, public.education_assignment_targets,
  public.education_assignment_submissions to authenticated;

create or replace function public.education_teacher_create_assignment(
  p_org_id uuid,
  p_class_id uuid,
  p_title text,
  p_description text,
  p_due_on date,
  p_max_score numeric,
  p_student_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_id uuid;
  selected_student_id uuid;
  valid_student_count integer;
begin
  if auth.uid() is null
    or not public.education_current_teacher_can_access_class(p_org_id, p_class_id) then
    raise exception 'You are not assigned to this class.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 160
    or length(coalesce(p_description, '')) > 10000
    or p_due_on is null
    or p_max_score is null or p_max_score <= 0 or p_max_score > 10000 then
    raise exception 'Assignment details are invalid.' using errcode = '22023';
  end if;
  if p_student_ids is null or cardinality(p_student_ids) not between 1 and 500
    or array_position(p_student_ids, null) is not null
    or cardinality(p_student_ids) <> (
      select count(distinct selected.id) from unnest(p_student_ids) as selected(id)
    ) then
    raise exception 'Select between one and 500 different students.' using errcode = '22023';
  end if;

  select count(*) into valid_student_count
  from unnest(p_student_ids) as selected(id)
  where public.education_teacher_class_contains_student(p_org_id, p_class_id, selected.id);
  if valid_student_count <> cardinality(p_student_ids) then
    raise exception 'One or more selected students are not assigned to this class.' using errcode = '42501';
  end if;

  insert into public.education_assignments (
    org_id, class_id, title, description, due_on, max_score, status, created_by
  )
  values (
    p_org_id, p_class_id, btrim(p_title), coalesce(p_description, ''), p_due_on, p_max_score, 'published', auth.uid()
  )
  returning id into assignment_id;

  foreach selected_student_id in array p_student_ids loop
    insert into public.education_assignment_targets (org_id, assignment_id, student_id)
    values (p_org_id, assignment_id, selected_student_id);
  end loop;

  return assignment_id;
end;
$$;

create or replace function public.education_student_submit_assignment(
  p_assignment_id uuid,
  p_student_id uuid,
  p_submission_text text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_org_id uuid;
  submission_id uuid;
begin
  if auth.uid() is null
    or length(btrim(coalesce(p_submission_text, ''))) not between 1 and 10000 then
    raise exception 'Submission text is invalid.' using errcode = '22023';
  end if;
  if not public.education_current_student_can_access(
    (select assignment.org_id from public.education_assignments as assignment where assignment.id = p_assignment_id),
    p_student_id
  ) then
    raise exception 'This student profile is not linked to your account.' using errcode = '42501';
  end if;

  select assignment.org_id into assignment_org_id
  from public.education_assignments as assignment
  join public.education_assignment_targets as target
    on target.org_id = assignment.org_id and target.assignment_id = assignment.id
  where assignment.id = p_assignment_id
    and assignment.status = 'published'
    and target.student_id = p_student_id;
  if assignment_org_id is null then
    raise exception 'The assignment is not available to this student.' using errcode = '42501';
  end if;

  insert into public.education_assignment_submissions (
    org_id, assignment_id, student_id, submission_text
  )
  values (assignment_org_id, p_assignment_id, p_student_id, btrim(p_submission_text))
  on conflict (org_id, assignment_id, student_id) do update
    set submission_text = excluded.submission_text,
        submitted_at = now(),
        updated_at = now()
    where education_assignment_submissions.graded_at is null
  returning id into submission_id;
  if submission_id is null then
    raise exception 'A graded submission cannot be changed.' using errcode = '42501';
  end if;
  return submission_id;
end;
$$;

create or replace function public.education_teacher_grade_assignment_submission(
  p_submission_id uuid,
  p_score numeric,
  p_feedback text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org_id uuid;
  target_class_id uuid;
  assignment_max_score numeric;
begin
  if auth.uid() is null or length(coalesce(p_feedback, '')) > 4000 then
    raise exception 'Grade details are invalid.' using errcode = '22023';
  end if;
  select assignment.org_id, assignment.class_id, assignment.max_score
    into target_org_id, target_class_id, assignment_max_score
  from public.education_assignment_submissions as submission
  join public.education_assignments as assignment
    on assignment.org_id = submission.org_id and assignment.id = submission.assignment_id
  where submission.id = p_submission_id;
  if target_org_id is null
    or not public.education_current_teacher_can_access_class(target_org_id, target_class_id) then
    raise exception 'You are not assigned to this class.' using errcode = '42501';
  end if;
  if p_score is null or p_score < 0 or p_score > assignment_max_score then
    raise exception 'The score must be between zero and the assignment maximum.' using errcode = '22023';
  end if;

  update public.education_assignment_submissions
  set score = p_score,
      feedback = nullif(btrim(coalesce(p_feedback, '')), ''),
      graded_by = auth.uid(),
      graded_at = now(),
      updated_at = now()
  where id = p_submission_id and org_id = target_org_id;

  return p_submission_id;
end;
$$;

revoke all on function public.education_teacher_create_assignment(uuid, uuid, text, text, date, numeric, uuid[]) from public, anon;
revoke all on function public.education_student_submit_assignment(uuid, uuid, text) from public, anon;
revoke all on function public.education_teacher_grade_assignment_submission(uuid, numeric, text) from public, anon;
grant execute on function public.education_teacher_create_assignment(uuid, uuid, text, text, date, numeric, uuid[]) to authenticated;
grant execute on function public.education_student_submit_assignment(uuid, uuid, text) to authenticated;
grant execute on function public.education_teacher_grade_assignment_submission(uuid, numeric, text) to authenticated;

create table if not exists public.education_student_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (org_id, student_id)
    references public.education_students(org_id, id) on delete cascade
);

create index if not exists education_student_ai_usage_user_created_idx
  on public.education_student_ai_usage_events (org_id, user_id, created_at desc);
alter table public.education_student_ai_usage_events enable row level security;
revoke all on public.education_student_ai_usage_events from public, anon, authenticated;
grant all on public.education_student_ai_usage_events to service_role;

create or replace function public.education_reserve_student_ai_request(
  p_org_id uuid,
  p_user_id uuid,
  p_student_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent_minute_count integer;
  recent_day_count integer;
begin
  if p_org_id is null or p_user_id is null or p_student_id is null
    or not exists (
      select 1 from public.education_students as student
      where student.org_id = p_org_id
        and student.id = p_student_id
        and student.user_id = p_user_id
        and student.status = 'active'
    ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_user_id::text, 0));
  delete from public.education_student_ai_usage_events
  where org_id = p_org_id and user_id = p_user_id and created_at < now() - interval '1 day';

  select
    count(*) filter (where created_at >= now() - interval '1 minute'),
    count(*)
  into recent_minute_count, recent_day_count
  from public.education_student_ai_usage_events
  where org_id = p_org_id and user_id = p_user_id;

  if recent_minute_count >= 8 or recent_day_count >= 100 then
    return false;
  end if;

  insert into public.education_student_ai_usage_events (org_id, user_id, student_id)
  values (p_org_id, p_user_id, p_student_id);
  return true;
end;
$$;

revoke all on function public.education_reserve_student_ai_request(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.education_reserve_student_ai_request(uuid, uuid, uuid) to service_role;

commit;
