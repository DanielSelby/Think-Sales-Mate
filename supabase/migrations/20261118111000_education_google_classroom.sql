begin;

create table if not exists public.education_google_classroom_connections (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  refresh_token_ciphertext text not null,
  granted_scopes text[] not null,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.education_google_classroom_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists education_google_classroom_oauth_states_expiry_idx
  on public.education_google_classroom_oauth_states (expires_at);

create table if not exists public.education_google_classroom_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  google_course_id text not null check (length(google_course_id) between 1 and 200),
  class_id uuid not null,
  branch_id uuid not null,
  academic_year_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, google_course_id),
  foreign key (org_id, branch_id, class_id)
    references public.education_classes(org_id, branch_id, id) on delete cascade,
  foreign key (org_id, academic_year_id)
    references public.education_academic_years(org_id, id) on delete restrict
);

create table if not exists public.education_google_classroom_audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'oauth_started', 'connected', 'disconnected', 'courses_listed',
    'course_mapped', 'roster_previewed', 'roster_imported'
  )),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.education_google_classroom_connections enable row level security;
alter table public.education_google_classroom_oauth_states enable row level security;
alter table public.education_google_classroom_mappings enable row level security;
alter table public.education_google_classroom_audit_events enable row level security;

revoke all on public.education_google_classroom_connections from public, anon, authenticated;
revoke all on public.education_google_classroom_oauth_states from public, anon, authenticated;
revoke all on public.education_google_classroom_mappings from public, anon, authenticated;
revoke all on public.education_google_classroom_audit_events from public, anon, authenticated;
grant all on public.education_google_classroom_connections to service_role;
grant all on public.education_google_classroom_oauth_states to service_role;
grant all on public.education_google_classroom_mappings to service_role;
grant all on public.education_google_classroom_audit_events to service_role;

create or replace function public.education_google_classroom_assert_actor(
  p_org_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null or p_actor_id is null
    or not exists (
      select 1
      from public.organization_members member
      join public.education_member_branch_scopes scope
        on scope.org_id = member.org_id and scope.user_id = member.user_id
        and scope.scope_type = 'organization' and scope.branch_id is null
      where member.org_id = p_org_id and member.user_id = p_actor_id and member.status = 'active'
    ) then
    raise exception 'Think Education organization access is required.';
  end if;
end;
$$;

create or replace function public.education_google_classroom_audit(
  p_org_id uuid,
  p_actor_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  if p_action not in (
    'oauth_started', 'connected', 'disconnected', 'courses_listed',
    'course_mapped', 'roster_previewed', 'roster_imported'
  ) then
    raise exception 'Invalid Google Classroom audit action.';
  end if;
  insert into public.education_google_classroom_audit_events (org_id, actor_id, action, metadata)
  values (p_org_id, p_actor_id, p_action, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.education_google_classroom_create_oauth_state(
  p_org_id uuid,
  p_actor_id uuid,
  p_state_hash text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  if p_state_hash !~ '^[0-9a-f]{64}$' or p_expires_at <= now()
    or p_expires_at > now() + interval '15 minutes' then
    raise exception 'Invalid Google Classroom OAuth state.';
  end if;
  delete from public.education_google_classroom_oauth_states where expires_at <= now();
  insert into public.education_google_classroom_oauth_states (state_hash, org_id, user_id, expires_at)
  values (p_state_hash, p_org_id, p_actor_id, p_expires_at);
  insert into public.education_google_classroom_audit_events (org_id, actor_id, action)
  values (p_org_id, p_actor_id, 'oauth_started');
  return true;
end;
$$;

create or replace function public.education_google_classroom_consume_oauth_state(
  p_org_id uuid,
  p_actor_id uuid,
  p_state_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed_count integer;
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  delete from public.education_google_classroom_oauth_states
  where state_hash = p_state_hash and org_id = p_org_id and user_id = p_actor_id and expires_at > now();
  get diagnostics consumed_count = row_count;
  return consumed_count = 1;
end;
$$;

create or replace function public.education_google_classroom_store_connection(
  p_org_id uuid,
  p_actor_id uuid,
  p_refresh_token_ciphertext text,
  p_granted_scopes text[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  if coalesce(length(p_refresh_token_ciphertext), 0) > 4096
    or not (p_granted_scopes @> array[
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.rosters.readonly',
      'https://www.googleapis.com/auth/classroom.profile.emails'
    ]) then
    raise exception 'Google Classroom did not grant the required read-only scopes.';
  end if;
  insert into public.education_google_classroom_connections (
    org_id, refresh_token_ciphertext, granted_scopes, connected_by, updated_at
  ) values (p_org_id, p_refresh_token_ciphertext, p_granted_scopes, p_actor_id, now())
  on conflict (org_id) do update set
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    granted_scopes = excluded.granted_scopes,
    connected_by = excluded.connected_by,
    updated_at = now();
  insert into public.education_google_classroom_audit_events (org_id, actor_id, action)
  values (p_org_id, p_actor_id, 'connected');
  return true;
end;
$$;

create or replace function public.education_google_classroom_get_connection(
  p_org_id uuid,
  p_actor_id uuid
)
returns table (refresh_token_ciphertext text, granted_scopes text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  return query
    select connection.refresh_token_ciphertext, connection.granted_scopes
    from public.education_google_classroom_connections connection
    where connection.org_id = p_org_id;
end;
$$;

create or replace function public.education_google_classroom_disconnect(
  p_org_id uuid,
  p_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  delete from public.education_google_classroom_connections where org_id = p_org_id;
  delete from public.education_google_classroom_mappings where org_id = p_org_id;
  insert into public.education_google_classroom_audit_events (org_id, actor_id, action)
  values (p_org_id, p_actor_id, 'disconnected');
  return true;
end;
$$;

create or replace function public.education_google_classroom_map_course(
  p_org_id uuid,
  p_actor_id uuid,
  p_google_course_id text,
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  class_row public.education_classes%rowtype;
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  if length(trim(coalesce(p_google_course_id, ''))) not between 1 and 200 then
    raise exception 'Invalid Google Classroom course.';
  end if;
  select classroom.* into class_row
  from public.education_classes classroom
  join public.education_campuses campus
    on campus.org_id = classroom.org_id and campus.branch_id = classroom.branch_id and campus.status = 'active'
  join public.education_academic_years year
    on year.org_id = classroom.org_id and year.id = classroom.academic_year_id
  where classroom.org_id = p_org_id and classroom.id = p_class_id
    and classroom.status = 'active' and year.status = 'active';
  if not found then raise exception 'Choose an active Education class and academic year.'; end if;
  insert into public.education_google_classroom_mappings (
    org_id, google_course_id, class_id, branch_id, academic_year_id, created_by, updated_at
  ) values (
    p_org_id, trim(p_google_course_id), class_row.id, class_row.branch_id,
    class_row.academic_year_id, p_actor_id, now()
  )
  on conflict (org_id, google_course_id) do update set
    class_id = excluded.class_id,
    branch_id = excluded.branch_id,
    academic_year_id = excluded.academic_year_id,
    created_by = excluded.created_by,
    updated_at = now();
  insert into public.education_google_classroom_audit_events (org_id, actor_id, action, metadata)
  values (p_org_id, p_actor_id, 'course_mapped',
    jsonb_build_object('google_course_id', trim(p_google_course_id), 'class_id', class_row.id));
  return jsonb_build_object(
    'class_id', class_row.id, 'branch_id', class_row.branch_id,
    'academic_year_id', class_row.academic_year_id
  );
end;
$$;

create or replace function public.education_google_classroom_import_roster(
  p_org_id uuid,
  p_actor_id uuid,
  p_google_course_id text,
  p_student_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mapped_course public.education_google_classroom_mappings%rowtype;
  inserted_count integer := 0;
  existing_count integer := 0;
  unmatched_emails jsonb := '[]'::jsonb;
  ambiguous_emails jsonb := '[]'::jsonb;
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  if coalesce(cardinality(p_student_emails), 0) > 5000 then
    raise exception 'Google Classroom roster is too large to import.';
  end if;
  select * into mapped_course
  from public.education_google_classroom_mappings mapping
  where mapping.org_id = p_org_id and mapping.google_course_id = p_google_course_id
  for update;
  if not found then raise exception 'Map this Google course to an Education class first.'; end if;

  with roster_emails as (
    select distinct lower(trim(email)) as email
    from unnest(coalesce(p_student_emails, array[]::text[])) as email
    where email is not null and length(trim(email)) between 3 and 320
  ), matches as (
    select roster.email, count(student.id)::integer as student_count, min(student.id::text)::uuid as student_id
    from roster_emails roster
    left join public.education_students student
      on student.org_id = p_org_id and student.branch_id = mapped_course.branch_id
      and student.status = 'active' and student.email is not null
      and lower(trim(student.email)) = roster.email
    group by roster.email
  ), inserted as (
    insert into public.education_student_enrollments (
      org_id, branch_id, student_id, class_id, academic_year_id, status, enrolled_on
    )
    select p_org_id, mapped_course.branch_id, matches.student_id,
      mapped_course.class_id, mapped_course.academic_year_id, 'active', current_date
    from matches
    where matches.student_count = 1
    on conflict (org_id, student_id, academic_year_id) do nothing
    returning student_id
  )
  select count(*) into inserted_count from inserted;

  with roster_emails as (
    select distinct lower(trim(email)) as email
    from unnest(coalesce(p_student_emails, array[]::text[])) as email
    where email is not null and length(trim(email)) between 3 and 320
  ), matches as (
    select roster.email, count(student.id)::integer as student_count,
      min(student.id::text)::uuid as student_id
    from roster_emails roster
    left join public.education_students student
      on student.org_id = p_org_id and student.branch_id = mapped_course.branch_id
      and student.status = 'active' and student.email is not null
      and lower(trim(student.email)) = roster.email
    group by roster.email
  )
  select
    coalesce(jsonb_agg(matches.email) filter (where matches.student_count = 0), '[]'::jsonb),
    coalesce(jsonb_agg(matches.email) filter (where matches.student_count > 1), '[]'::jsonb),
    count(*) filter (
      where matches.student_count = 1 and exists (
        select 1 from public.education_student_enrollments enrollment
        where enrollment.org_id = p_org_id and enrollment.student_id = matches.student_id
          and enrollment.academic_year_id = mapped_course.academic_year_id
      )
    )::integer
  into unmatched_emails, ambiguous_emails, existing_count
  from matches;

  insert into public.education_google_classroom_audit_events (org_id, actor_id, action, metadata)
  values (p_org_id, p_actor_id, 'roster_imported', jsonb_build_object(
    'google_course_id', p_google_course_id,
    'class_id', mapped_course.class_id,
    'inserted_count', inserted_count,
    'already_enrolled_count', existing_count,
    'unmatched_count', jsonb_array_length(unmatched_emails),
    'ambiguous_count', jsonb_array_length(ambiguous_emails)
  ));
  return jsonb_build_object(
    'inserted_count', inserted_count,
    'already_enrolled_count', existing_count,
    'unmatched_emails', unmatched_emails,
    'ambiguous_emails', ambiguous_emails
  );
end;
$$;

create or replace function public.education_google_classroom_audit_preview(
  p_org_id uuid,
  p_actor_id uuid,
  p_google_course_id text,
  p_roster_size integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.education_google_classroom_assert_actor(p_org_id, p_actor_id);
  if not exists (
    select 1 from public.education_google_classroom_mappings mapping
    where mapping.org_id = p_org_id and mapping.google_course_id = p_google_course_id
  ) then raise exception 'Map this Google course to an Education class first.'; end if;
  insert into public.education_google_classroom_audit_events (org_id, actor_id, action, metadata)
  values (p_org_id, p_actor_id, 'roster_previewed',
    jsonb_build_object('google_course_id', p_google_course_id, 'roster_size', greatest(0, p_roster_size)));
end;
$$;

revoke all on function public.education_google_classroom_assert_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.education_google_classroom_audit(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.education_google_classroom_create_oauth_state(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.education_google_classroom_consume_oauth_state(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.education_google_classroom_store_connection(uuid, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.education_google_classroom_get_connection(uuid, uuid) from public, anon, authenticated;
revoke all on function public.education_google_classroom_disconnect(uuid, uuid) from public, anon, authenticated;
revoke all on function public.education_google_classroom_map_course(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.education_google_classroom_import_roster(uuid, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.education_google_classroom_audit_preview(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.education_google_classroom_create_oauth_state(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.education_google_classroom_consume_oauth_state(uuid, uuid, text) to service_role;
grant execute on function public.education_google_classroom_audit(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.education_google_classroom_store_connection(uuid, uuid, text, text[]) to service_role;
grant execute on function public.education_google_classroom_get_connection(uuid, uuid) to service_role;
grant execute on function public.education_google_classroom_disconnect(uuid, uuid) to service_role;
grant execute on function public.education_google_classroom_map_course(uuid, uuid, text, uuid) to service_role;
grant execute on function public.education_google_classroom_import_roster(uuid, uuid, text, text[]) to service_role;
grant execute on function public.education_google_classroom_audit_preview(uuid, uuid, text, integer) to service_role;

commit;
