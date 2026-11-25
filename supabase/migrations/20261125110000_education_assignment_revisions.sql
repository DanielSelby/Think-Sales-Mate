begin;

alter table public.education_assignment_submissions
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists revision_request_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'education_assignment_revision_request_note_length'
      and conrelid = 'public.education_assignment_submissions'::regclass
  ) then
    alter table public.education_assignment_submissions
      add constraint education_assignment_revision_request_note_length
      check (revision_request_note is null or char_length(revision_request_note) <= 2000);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'education_assignment_revision_request_actor_check'
      and conrelid = 'public.education_assignment_submissions'::regclass
  ) then
    alter table public.education_assignment_submissions
      add constraint education_assignment_revision_request_actor_check
      check ((revision_requested_at is null) = (revision_requested_by is null));
  end if;
end;
$$;

create table if not exists public.education_assignment_submission_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.education_assignment_submissions(id) on delete cascade,
  version_number integer not null check (version_number between 1 and 20),
  submission_text text not null check (char_length(submission_text) <= 10000),
  submitted_at timestamptz not null,
  score numeric(8, 2),
  feedback text,
  graded_by uuid references auth.users(id) on delete set null,
  graded_at timestamptz,
  revision_requested_at timestamptz,
  revision_requested_by uuid references auth.users(id) on delete set null,
  revision_request_note text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (org_id, submission_id, version_number),
  check (score is null or score >= 0),
  check (feedback is null or char_length(feedback) <= 4000),
  check (revision_request_note is null or char_length(revision_request_note) <= 2000)
);

create index if not exists education_assignment_submission_versions_history_idx
  on public.education_assignment_submission_versions (org_id, submission_id, version_number desc);

alter table public.education_assignment_submission_versions enable row level security;
revoke all on public.education_assignment_submission_versions from public, anon, authenticated;

create or replace function public.education_archive_assignment_submission_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_version integer;
begin
  if new.submission_text is not distinct from old.submission_text
    and new.submitted_at is not distinct from old.submitted_at then
    return new;
  end if;

  select coalesce(max(version.version_number), 0) + 1
    into next_version
  from public.education_assignment_submission_versions version
  where version.org_id = old.org_id
    and version.submission_id = old.id;
  if next_version > 20 then
    raise exception 'This assignment has reached the maximum number of saved revisions.'
      using errcode = '22023';
  end if;

  insert into public.education_assignment_submission_versions (
    org_id, submission_id, version_number, submission_text, submitted_at,
    score, feedback, graded_by, graded_at, revision_requested_at,
    revision_requested_by, revision_request_note, recorded_by
  ) values (
    old.org_id, old.id, next_version, old.submission_text, old.submitted_at,
    old.score, old.feedback, old.graded_by, old.graded_at, old.revision_requested_at,
    old.revision_requested_by, old.revision_request_note, auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.education_archive_assignment_submission_version() from public, anon, authenticated;

drop trigger if exists education_assignment_submission_version_archive
  on public.education_assignment_submissions;
create trigger education_assignment_submission_version_archive
  before update of submission_text, submitted_at on public.education_assignment_submissions
  for each row execute function public.education_archive_assignment_submission_version();

create or replace function public.education_teacher_request_assignment_revision(
  p_submission_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org_id uuid;
  target_class_id uuid;
begin
  if auth.uid() is null
    or length(btrim(coalesce(p_note, ''))) not between 1 and 2000 then
    raise exception 'A revision request note is required.' using errcode = '22023';
  end if;

  select assignment.org_id, assignment.class_id
    into target_org_id, target_class_id
  from public.education_assignment_submissions submission
  join public.education_assignments assignment
    on assignment.org_id = submission.org_id
    and assignment.id = submission.assignment_id
  where submission.id = p_submission_id
  for update of submission;

  if target_org_id is null
    or not public.education_current_teacher_can_access_class(target_org_id, target_class_id) then
    raise exception 'You are not assigned to this class.' using errcode = '42501';
  end if;

  update public.education_assignment_submissions
  set revision_requested_at = now(),
      revision_requested_by = auth.uid(),
      revision_request_note = btrim(p_note),
      updated_at = now()
  where id = p_submission_id
    and org_id = target_org_id
    and graded_at is not null
    and revision_requested_at is null;

  if not found then
    raise exception 'Only a graded submission without an open revision request can be returned.' using errcode = '22023';
  end if;
  return p_submission_id;
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

  select assignment.org_id into assignment_org_id
  from public.education_assignments assignment
  join public.education_assignment_targets target
    on target.org_id = assignment.org_id
    and target.assignment_id = assignment.id
    and target.student_id = p_student_id
  where assignment.id = p_assignment_id
    and assignment.status = 'published';

  if assignment_org_id is null
    or not public.education_current_student_can_access(assignment_org_id, p_student_id) then
    raise exception 'This assignment is not available to the linked student profile.' using errcode = '42501';
  end if;

  insert into public.education_assignment_submissions (
    org_id, assignment_id, student_id, submission_text
  ) values (
    assignment_org_id, p_assignment_id, p_student_id, btrim(p_submission_text)
  )
  on conflict (org_id, assignment_id, student_id) do update
    set submission_text = excluded.submission_text,
        submitted_at = now(),
        score = null,
        feedback = null,
        graded_by = null,
        graded_at = null,
        revision_requested_at = null,
        revision_requested_by = null,
        revision_request_note = null,
        updated_at = now()
  where education_assignment_submissions.graded_at is null
     or education_assignment_submissions.revision_requested_at is not null
  returning id into submission_id;

  if submission_id is null then
    raise exception 'A graded submission can only be changed when the teacher requests a revision.' using errcode = '42501';
  end if;
  return submission_id;
end;
$$;

create or replace function public.education_get_assignment_submission_versions(
  p_submission_ids uuid[]
)
returns table (
  org_id uuid,
  submission_id uuid,
  version_number integer,
  submission_text text,
  submitted_at timestamptz,
  score numeric,
  feedback text,
  graded_at timestamptz,
  revision_requested_at timestamptz,
  revision_request_note text,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or p_submission_ids is null
    or cardinality(p_submission_ids) not between 1 and 100
    or array_position(p_submission_ids, null) is not null
    or cardinality(p_submission_ids) <> (
      select count(distinct requested.id)
      from unnest(p_submission_ids) as requested(id)
    ) then
    raise exception 'Submission history request is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_submission_ids) as requested(id)
    left join public.education_assignment_submissions submission
      on submission.id = requested.id
    left join public.education_assignments assignment
      on assignment.org_id = submission.org_id
      and assignment.id = submission.assignment_id
    where submission.id is null
      or not (
        public.education_current_student_can_access(submission.org_id, submission.student_id)
        or public.education_current_guardian_can_access_student(submission.org_id, submission.student_id)
        or public.education_current_teacher_can_access_class(assignment.org_id, assignment.class_id)
      )
  ) then
    raise exception 'One or more submissions are not available to this account.' using errcode = '42501';
  end if;

  return query
  with ranked_versions as (
    select
      version.org_id,
      version.submission_id,
      version.version_number,
      version.submission_text,
      version.submitted_at,
      version.score,
      version.feedback,
      version.graded_at,
      version.revision_requested_at,
      version.revision_request_note,
      version.recorded_at,
      row_number() over (
        partition by version.submission_id
        order by version.version_number desc
      ) as row_number
    from public.education_assignment_submission_versions version
    where version.submission_id = any(p_submission_ids)
  )
  select
    ranked_versions.org_id,
    ranked_versions.submission_id,
    ranked_versions.version_number,
    ranked_versions.submission_text,
    ranked_versions.submitted_at,
    ranked_versions.score,
    ranked_versions.feedback,
    ranked_versions.graded_at,
    ranked_versions.revision_requested_at,
    ranked_versions.revision_request_note,
    ranked_versions.recorded_at
  from ranked_versions
  where ranked_versions.row_number <= 5
  order by ranked_versions.submission_id, ranked_versions.version_number desc;
end;
$$;

revoke all on function public.education_teacher_request_assignment_revision(uuid, text)
  from public, anon;
grant execute on function public.education_teacher_request_assignment_revision(uuid, text)
  to authenticated;
revoke all on function public.education_student_submit_assignment(uuid, uuid, text)
  from public, anon;
grant execute on function public.education_student_submit_assignment(uuid, uuid, text)
  to authenticated;
revoke all on function public.education_get_assignment_submission_versions(uuid[])
  from public, anon;
grant execute on function public.education_get_assignment_submission_versions(uuid[])
  to authenticated;

commit;
