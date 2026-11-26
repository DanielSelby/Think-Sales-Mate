begin;

create table if not exists public.education_report_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.business_locations(id) on delete cascade,
  term_id uuid not null references public.education_academic_terms(id) on delete cascade,
  student_id uuid not null references public.education_students(id) on delete cascade,
  teacher_comment text,
  principal_comment text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint education_report_cards_unique unique (org_id, branch_id, term_id, student_id)
);

create index if not exists education_report_cards_lookup_idx
  on public.education_report_cards (org_id, branch_id, term_id, student_id, status);

alter table public.education_notifications
  add column if not exists report_card_id uuid;

create unique index if not exists education_notifications_report_card_unique_idx
  on public.education_notifications (org_id, user_id, report_card_id)
  where report_card_id is not null;

create index if not exists education_notifications_report_card_idx
  on public.education_notifications (report_card_id, created_at desc)
  where report_card_id is not null;

alter table public.education_report_cards enable row level security;
revoke all on public.education_report_cards from public, anon, authenticated;

create or replace function public.education_save_report_card(
  p_org_id uuid,
  p_branch_id uuid,
  p_term_id uuid,
  p_student_id uuid,
  p_teacher_comment text,
  p_principal_comment text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report_id uuid;
  student_branch uuid;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_term_id is null or p_student_id is null then
    raise exception 'Report-card details are invalid.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_teacher_comment, '')) > 2000
    or char_length(coalesce(p_principal_comment, '')) > 2000 then
    raise exception 'Report-card comments must be 2000 characters or fewer.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_results', 'edit')
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_results', 'edit') then
    raise exception 'You do not have permission to edit report cards.' using errcode = '42501';
  end if;

  select student.branch_id into student_branch
  from public.education_students student
  where student.org_id = p_org_id
    and student.id = p_student_id;
  if not found or student_branch <> p_branch_id then
    raise exception 'The student is outside the selected campus.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.education_examinations exam
    join public.education_results result
      on result.org_id = exam.org_id
      and result.examination_id = exam.id
      and result.branch_id = exam.branch_id
    where exam.org_id = p_org_id
      and exam.branch_id = p_branch_id
      and exam.term_id = p_term_id
      and exam.status = 'published'
      and result.student_id = p_student_id
      and result.status = 'published'
  ) then
    raise exception 'Published examination results are required before saving a report card.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.education_report_cards report
    where report.org_id = p_org_id
      and report.branch_id = p_branch_id
      and report.term_id = p_term_id
      and report.student_id = p_student_id
      and report.status = 'published'
  ) then
    raise exception 'Published report cards cannot be changed.' using errcode = '22023';
  end if;

  insert into public.education_report_cards (
    org_id, branch_id, term_id, student_id,
    teacher_comment, principal_comment, status,
    created_by, updated_by, updated_at
  ) values (
    p_org_id, p_branch_id, p_term_id, p_student_id,
    nullif(btrim(p_teacher_comment), ''),
    nullif(btrim(p_principal_comment), ''),
    'draft', auth.uid(), auth.uid(), now()
  )
  on conflict (org_id, branch_id, term_id, student_id)
  do update set
    teacher_comment = excluded.teacher_comment,
    principal_comment = excluded.principal_comment,
    status = case
      when public.education_report_cards.status = 'published' then 'published'
      else 'draft'
    end,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into report_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_report_card_saved',
    'education_report_card', report_id,
    jsonb_build_object('branch_id', p_branch_id, 'term_id', p_term_id, 'student_id', p_student_id)
  );
  return report_id;
end;
$$;

revoke all on function public.education_save_report_card(uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.education_save_report_card(uuid, uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.education_publish_report_card(
  p_org_id uuid,
  p_branch_id uuid,
  p_term_id uuid,
  p_student_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report_id uuid;
  term_name text;
  student_name text;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_term_id is null or p_student_id is null then
    raise exception 'Report-card details are invalid.' using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_results', 'publish')
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_results', 'publish')
    or not public.has_org_product_permission(p_org_id, 'think-education', 'education_results', 'approve') then
    raise exception 'Approval and publish permission are required.' using errcode = '42501';
  end if;

  select report.id into report_id
  from public.education_report_cards report
  where report.org_id = p_org_id
    and report.branch_id = p_branch_id
    and report.term_id = p_term_id
    and report.student_id = p_student_id
  for update;
  if not found then
    raise exception 'Save the report card before publishing it.' using errcode = 'P0002';
  end if;

  update public.education_report_cards
  set status = 'published',
      published_by = auth.uid(),
      published_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = report_id;

  select term.name into term_name
  from public.education_academic_terms term
  where term.org_id = p_org_id
    and term.id = p_term_id;

  select trim(concat(student.first_name, ' ', coalesce(student.other_names, ''), ' ', student.last_name))
  into student_name
  from public.education_students student
  where student.org_id = p_org_id
    and student.id = p_student_id;

  insert into public.education_notifications (
    org_id, branch_id, user_id, notification_type,
    title, message, report_card_id, delivery_status, created_at
  )
  select
    p_org_id,
    p_branch_id,
    student.user_id,
    'results',
    'Report card published',
    coalesce(term_name, 'Academic term') || ' report card for ' || coalesce(student_name, 'your profile') || ' is now available.',
    report_id,
    'delivered',
    now()
  from public.education_students student
  where student.org_id = p_org_id
    and student.id = p_student_id
    and student.user_id is not null
    and coalesce((
      select preference.in_app_enabled
      from public.education_notification_preferences preference
      where preference.org_id = p_org_id
        and preference.user_id = student.user_id
        and preference.notification_type = 'results'
    ), true)
  on conflict do nothing;

  insert into public.education_notifications (
    org_id, branch_id, user_id, notification_type,
    title, message, report_card_id, delivery_status, created_at
  )
  select distinct
    p_org_id,
    p_branch_id,
    guardian.user_id,
    'results',
    'Report card published',
    coalesce(term_name, 'Academic term') || ' report card for ' || coalesce(student_name, 'your linked student') || ' is now available.',
    report_id,
    'delivered',
    now()
  from public.education_student_guardians relationship
  join public.education_guardians guardian
    on guardian.org_id = relationship.org_id
    and guardian.id = relationship.guardian_id
    and guardian.status = 'active'
  where relationship.org_id = p_org_id
    and relationship.branch_id = p_branch_id
    and relationship.student_id = p_student_id
    and relationship.status = 'verified'
    and guardian.user_id is not null
    and coalesce((
      select preference.in_app_enabled
      from public.education_notification_preferences preference
      where preference.org_id = p_org_id
        and preference.user_id = guardian.user_id
        and preference.notification_type = 'results'
    ), true)
  on conflict do nothing;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_report_card_published',
    'education_report_card', report_id,
    jsonb_build_object('branch_id', p_branch_id, 'term_id', p_term_id, 'student_id', p_student_id)
  );
  return report_id;
end;
$$;

revoke all on function public.education_publish_report_card(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.education_publish_report_card(uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.education_get_report_cards(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_term_id uuid
) returns table (
  report_card_id uuid,
  student_id uuid,
  branch_id uuid,
  status text,
  teacher_comment text,
  principal_comment text,
  published_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select report.id, report.student_id, report.branch_id, report.status,
         report.teacher_comment, report.principal_comment, report.published_at
  from public.education_report_cards report
  where report.org_id = p_org_id
    and report.term_id = p_term_id
    and report.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
    and public.education_can_access_branch(p_org_id, report.branch_id, 'education_results', 'view');
$$;

revoke all on function public.education_get_report_cards(uuid, uuid[], uuid) from public, anon;
grant execute on function public.education_get_report_cards(uuid, uuid[], uuid) to authenticated;

create or replace function public.education_get_published_student_report_cards(
  p_org_id uuid,
  p_student_id uuid
) returns table (
  term_id uuid,
  term_name text,
  starts_on date,
  ends_on date,
  teacher_comment text,
  principal_comment text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select term.id, term.name, term.starts_on, term.ends_on,
         report.teacher_comment, report.principal_comment, report.published_at
  from public.education_report_cards report
  join public.education_academic_terms term
    on term.org_id = report.org_id
    and term.id = report.term_id
  join public.education_students student
    on student.org_id = report.org_id
    and student.id = report.student_id
  where auth.uid() is not null
    and report.org_id = p_org_id
    and report.student_id = p_student_id
    and report.status = 'published'
    and student.user_id = auth.uid()
    and student.status = 'active'
    and public.has_product_access(report.org_id, 'think-education', false)
  order by term.starts_on desc, term.sequence_number desc;
$$;

revoke all on function public.education_get_published_student_report_cards(uuid, uuid) from public, anon;
grant execute on function public.education_get_published_student_report_cards(uuid, uuid) to authenticated;

create table if not exists public.education_report_card_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  report_card_id uuid not null references public.education_report_cards(id) on delete cascade,
  student_id uuid not null,
  guardian_id uuid not null,
  acknowledged_by uuid not null references auth.users(id) on delete cascade,
  comment text,
  acknowledged_at timestamptz not null default now(),
  unique (org_id, report_card_id, guardian_id),
  foreign key (org_id, student_id)
    references public.education_students(org_id, id) on delete cascade,
  foreign key (org_id, guardian_id)
    references public.education_guardians(org_id, id) on delete cascade,
  check (char_length(coalesce(comment, '')) <= 2000)
);

create index if not exists education_report_card_ack_report_idx
  on public.education_report_card_acknowledgements (org_id, report_card_id, acknowledged_at desc);

alter table public.education_report_card_acknowledgements enable row level security;
revoke all on public.education_report_card_acknowledgements from public, anon, authenticated;

create or replace function public.education_acknowledge_report_card(
  p_org_id uuid,
  p_report_card_id uuid,
  p_comment text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  report_row public.education_report_cards%rowtype;
  guardian_row public.education_guardians%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_report_card_id is null then
    raise exception 'Report-card acknowledgement details are invalid.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_comment, '')) > 2000 then
    raise exception 'Acknowledgement comments must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  select report.* into report_row
  from public.education_report_cards report
  where report.org_id = p_org_id
    and report.id = p_report_card_id
    and report.status = 'published';
  if not found then
    raise exception 'This published report card was not found.' using errcode = 'P0002';
  end if;

  select guardian.* into guardian_row
  from public.education_guardians guardian
  join public.education_student_guardians relationship
    on relationship.org_id = guardian.org_id
    and relationship.guardian_id = guardian.id
    and relationship.student_id = report_row.student_id
    and relationship.status = 'verified'
  where guardian.org_id = p_org_id
    and guardian.user_id = auth.uid()
    and guardian.status = 'active';
  if not found then
    raise exception 'You are not a verified guardian of this student.' using errcode = '42501';
  end if;
  if not public.has_product_access(p_org_id, 'think-education', false) then
    raise exception 'Think Education is not available to this organization.' using errcode = '42501';
  end if;

  insert into public.education_report_card_acknowledgements (
    org_id, report_card_id, student_id, guardian_id, acknowledged_by, comment, acknowledged_at
  ) values (
    p_org_id, p_report_card_id, report_row.student_id, guardian_row.id,
    auth.uid(), nullif(btrim(p_comment), ''), now()
  )
  on conflict (org_id, report_card_id, guardian_id)
  do update set
    comment = excluded.comment,
    acknowledged_by = auth.uid(),
    acknowledged_at = now();

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_report_card_acknowledged',
    'education_report_card', p_report_card_id,
    jsonb_build_object('student_id', report_row.student_id, 'guardian_id', guardian_row.id)
  );
  return true;
end;
$$;

revoke all on function public.education_acknowledge_report_card(uuid, uuid, text) from public, anon;
grant execute on function public.education_acknowledge_report_card(uuid, uuid, text) to authenticated;

create or replace function public.education_get_report_card_acknowledgements(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_term_id uuid
) returns table (
  report_card_id uuid,
  student_id uuid,
  guardian_id uuid,
  guardian_name text,
  comment text,
  acknowledged_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select report.id, report.student_id, acknowledgement.guardian_id,
         trim(concat(guardian.first_name, ' ', guardian.last_name)),
         acknowledgement.comment, acknowledgement.acknowledged_at
  from public.education_report_cards report
  join public.education_report_card_acknowledgements acknowledgement
    on acknowledgement.org_id = report.org_id
    and acknowledgement.report_card_id = report.id
  join public.education_guardians guardian
    on guardian.org_id = acknowledgement.org_id
    and guardian.id = acknowledgement.guardian_id
  where report.org_id = p_org_id
    and report.term_id = p_term_id
    and report.status = 'published'
    and report.branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))
    and public.education_can_access_branch(p_org_id, report.branch_id, 'education_results', 'view');
$$;

revoke all on function public.education_get_report_card_acknowledgements(uuid, uuid[], uuid) from public, anon;
grant execute on function public.education_get_report_card_acknowledgements(uuid, uuid[], uuid) to authenticated;

create or replace function public.education_get_published_guardian_report_cards(
  p_org_id uuid,
  p_student_id uuid
) returns table (
  report_card_id uuid,
  term_id uuid,
  term_name text,
  starts_on date,
  ends_on date,
  teacher_comment text,
  principal_comment text,
  published_at timestamptz,
  acknowledged_at timestamptz,
  acknowledgement_comment text
)
language sql
stable
security definer
set search_path = public
as $$
  select report.id, term.id, term.name, term.starts_on, term.ends_on,
         report.teacher_comment, report.principal_comment, report.published_at,
         acknowledgement.acknowledged_at, acknowledgement.comment
  from public.education_report_cards report
  join public.education_academic_terms term
    on term.org_id = report.org_id
    and term.id = report.term_id
  join public.education_student_guardians relationship
    on relationship.org_id = report.org_id
    and relationship.student_id = report.student_id
    and relationship.status = 'verified'
  join public.education_guardians guardian
    on guardian.org_id = relationship.org_id
    and guardian.id = relationship.guardian_id
    and guardian.status = 'active'
  left join public.education_report_card_acknowledgements acknowledgement
    on acknowledgement.org_id = report.org_id
    and acknowledgement.report_card_id = report.id
    and acknowledgement.guardian_id = guardian.id
  where auth.uid() is not null
    and report.org_id = p_org_id
    and report.student_id = p_student_id
    and report.status = 'published'
    and guardian.user_id = auth.uid()
    and public.has_product_access(report.org_id, 'think-education', false)
  order by term.starts_on desc, term.sequence_number desc;
$$;

revoke all on function public.education_get_published_guardian_report_cards(uuid, uuid) from public, anon;
grant execute on function public.education_get_published_guardian_report_cards(uuid, uuid) to authenticated;

commit;
