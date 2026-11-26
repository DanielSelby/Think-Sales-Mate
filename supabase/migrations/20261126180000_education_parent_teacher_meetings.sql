begin;

create table if not exists public.education_parent_teacher_meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  staff_id uuid not null,
  student_id uuid not null,
  guardian_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  purpose text check (purpose is null or char_length(btrim(purpose)) <= 500),
  meeting_note text,
  created_by uuid references auth.users(id) on delete set null,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, staff_id)
    references public.education_staff(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, guardian_id)
    references public.education_guardians(org_id, id) on delete restrict,
  check (ends_at > starts_at)
);

create index if not exists education_ptm_staff_time_idx
  on public.education_parent_teacher_meetings (org_id, branch_id, staff_id, starts_at)
  where status = 'scheduled';
create index if not exists education_ptm_student_time_idx
  on public.education_parent_teacher_meetings (org_id, student_id, starts_at)
  where status = 'scheduled';
create index if not exists education_ptm_guardian_time_idx
  on public.education_parent_teacher_meetings (org_id, guardian_id, starts_at)
  where guardian_id is not null and status = 'scheduled';

alter table public.education_parent_teacher_meetings enable row level security;
revoke all on public.education_parent_teacher_meetings from public, anon, authenticated;

create or replace function public.education_schedule_ptm(
  p_org_id uuid,
  p_branch_id uuid,
  p_staff_id uuid,
  p_student_id uuid,
  p_guardian_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_purpose text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  meeting_id uuid;
  is_current_teacher boolean;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_staff_id is null or p_student_id is null or p_starts_at is null
    or p_ends_at is null or p_ends_at <= p_starts_at
    or char_length(coalesce(p_purpose, '')) > 500 then
    raise exception 'Meeting details are invalid.' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.education_staff staff
    where staff.org_id = p_org_id
      and staff.branch_id = p_branch_id
      and staff.id = p_staff_id
      and staff.user_id = auth.uid()
      and staff.staff_category = 'teaching'
      and staff.status = 'active'
  ) into is_current_teacher;

  if not is_current_teacher
    and not public.education_can_access_branch(p_org_id, p_branch_id, 'education_staff', 'edit') then
    raise exception 'Only the assigned teacher or an authorized staff administrator can schedule meetings.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.education_staff staff
    where staff.org_id = p_org_id
      and staff.branch_id = p_branch_id
      and staff.id = p_staff_id
      and staff.staff_category = 'teaching'
      and staff.status = 'active'
  ) then
    raise exception 'The selected teacher is unavailable.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.education_students student
    where student.org_id = p_org_id
      and student.branch_id = p_branch_id
      and student.id = p_student_id
      and student.status = 'active'
  ) then
    raise exception 'The selected student is unavailable.' using errcode = 'P0002';
  end if;
  if p_guardian_id is not null and not exists (
    select 1
    from public.education_student_guardians relationship
    join public.education_guardians guardian
      on guardian.org_id = relationship.org_id
      and guardian.id = relationship.guardian_id
    where relationship.org_id = p_org_id
      and relationship.branch_id = p_branch_id
      and relationship.student_id = p_student_id
      and relationship.guardian_id = p_guardian_id
      and relationship.status = 'verified'
      and guardian.status = 'active'
  ) then
    raise exception 'The guardian is not verified for this student.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.education_parent_teacher_meetings meeting
    where meeting.org_id = p_org_id
      and meeting.branch_id = p_branch_id
      and meeting.staff_id = p_staff_id
      and meeting.status = 'scheduled'
      and meeting.starts_at < p_ends_at
      and meeting.ends_at > p_starts_at
  ) then
    raise exception 'The teacher already has another meeting in this time slot.' using errcode = '22023';
  end if;

  insert into public.education_parent_teacher_meetings (
    org_id, branch_id, staff_id, student_id, guardian_id,
    starts_at, ends_at, status, purpose, created_by, updated_at
  ) values (
    p_org_id, p_branch_id, p_staff_id, p_student_id, p_guardian_id,
    p_starts_at, p_ends_at, 'scheduled', nullif(btrim(p_purpose), ''),
    auth.uid(), now()
  ) returning id into meeting_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_ptm_scheduled',
    'education_parent_teacher_meeting', meeting_id,
    jsonb_build_object('staff_id', p_staff_id, 'student_id', p_student_id,
      'guardian_id', p_guardian_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at)
  );
  return meeting_id;
end;
$$;

revoke all on function public.education_schedule_ptm(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.education_schedule_ptm(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.education_guardian_book_ptm(
  p_org_id uuid,
  p_meeting_id uuid,
  p_purpose text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  meeting public.education_parent_teacher_meetings%rowtype;
  guardian_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_meeting_id is null
    or char_length(coalesce(p_purpose, '')) > 500 then
    raise exception 'Booking details are invalid.' using errcode = '22023';
  end if;
  select meeting.* into meeting
  from public.education_parent_teacher_meetings meeting
  where meeting.org_id = p_org_id
    and meeting.id = p_meeting_id
    and meeting.status = 'scheduled'
  for update;
  if not found then
    raise exception 'The meeting slot is unavailable.' using errcode = 'P0002';
  end if;

  select guardian.id into guardian_id
  from public.education_guardians guardian
  join public.education_student_guardians relationship
    on relationship.org_id = guardian.org_id
    and relationship.guardian_id = guardian.id
    and relationship.student_id = meeting.student_id
    and relationship.status = 'verified'
  where guardian.org_id = p_org_id
    and guardian.user_id = auth.uid()
    and guardian.status = 'active';
  if not found then
    raise exception 'You are not a verified guardian for this student.' using errcode = '42501';
  end if;

  if meeting.guardian_id is not null and meeting.guardian_id <> guardian_id then
    raise exception 'This slot is reserved for another guardian.' using errcode = '22023';
  end if;

  update public.education_parent_teacher_meetings
  set guardian_id = guardian_id,
      purpose = nullif(btrim(p_purpose), ''),
      updated_at = now()
  where id = meeting.id;
  return true;
end;
$$;

revoke all on function public.education_guardian_book_ptm(uuid, uuid, text) from public, anon;
grant execute on function public.education_guardian_book_ptm(uuid, uuid, text) to authenticated;

create or replace function public.education_cancel_ptm(
  p_org_id uuid,
  p_meeting_id uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  meeting public.education_parent_teacher_meetings%rowtype;
  is_current_teacher boolean;
  is_current_guardian boolean;
begin
  if auth.uid() is null or p_org_id is null or p_meeting_id is null
    or char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'Cancellation details are invalid.' using errcode = '22023';
  end if;
  select meeting.* into meeting
  from public.education_parent_teacher_meetings meeting
  where meeting.org_id = p_org_id
    and meeting.id = p_meeting_id
    and meeting.status = 'scheduled'
  for update;
  if not found then
    raise exception 'The meeting was not found or is no longer scheduled.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.education_staff staff
    where staff.org_id = p_org_id
      and staff.branch_id = meeting.branch_id
      and staff.id = meeting.staff_id
      and staff.user_id = auth.uid()
      and staff.status = 'active'
  ) into is_current_teacher;
  select exists (
    select 1
    from public.education_guardians guardian
    where guardian.org_id = p_org_id
      and guardian.id = meeting.guardian_id
      and guardian.user_id = auth.uid()
      and guardian.status = 'active'
  ) into is_current_guardian;

  if not is_current_teacher
    and not is_current_guardian
    and not public.education_can_access_branch(p_org_id, meeting.branch_id, 'education_staff', 'edit') then
    raise exception 'You are not authorized to cancel this meeting.' using errcode = '42501';
  end if;

  update public.education_parent_teacher_meetings
  set status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancellation_reason = nullif(btrim(p_reason), ''),
      updated_at = now()
  where id = meeting.id;
  return true;
end;
$$;

revoke all on function public.education_cancel_ptm(uuid, uuid, text) from public, anon;
grant execute on function public.education_cancel_ptm(uuid, uuid, text) to authenticated;

create or replace function public.education_get_ptm_list(
  p_org_id uuid,
  p_branch_ids uuid[],
  p_from timestamptz,
  p_to timestamptz
) returns table (
  meeting_id uuid,
  branch_id uuid,
  staff_id uuid,
  student_id uuid,
  guardian_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  purpose text,
  meeting_note text,
  cancelled_reason text
)
language sql
stable
set search_path = public
as $$
  select meeting.id, meeting.branch_id, meeting.staff_id, meeting.student_id,
         meeting.guardian_id, meeting.starts_at, meeting.ends_at, meeting.status,
         meeting.purpose, meeting.meeting_note, meeting.cancellation_reason
  from public.education_parent_teacher_meetings meeting
  where meeting.org_id = p_org_id
    and (
      coalesce(array_length(p_branch_ids, 1), 0) = 0
      or meeting.branch_id = any(p_branch_ids)
    )
    and meeting.starts_at >= p_from
    and meeting.starts_at <= p_to
    and (
      exists (
        select 1 from public.education_staff staff
        where staff.org_id = p_org_id
          and staff.branch_id = meeting.branch_id
          and staff.id = meeting.staff_id
          and staff.user_id = auth.uid()
      )
      or public.education_can_access_branch(p_org_id, meeting.branch_id, 'education_staff', 'view')
      or exists (
        select 1
        from public.education_guardians guardian
        join public.education_student_guardians relationship
          on relationship.org_id = guardian.org_id
          and relationship.guardian_id = guardian.id
          and relationship.student_id = meeting.student_id
          and relationship.status = 'verified'
        where guardian.org_id = p_org_id
          and guardian.user_id = auth.uid()
          and guardian.status = 'active'
          and (meeting.guardian_id is null or guardian.id = meeting.guardian_id)
      )
    );
$$;

revoke all on function public.education_get_ptm_list(uuid, uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.education_get_ptm_list(uuid, uuid[], timestamptz, timestamptz) to authenticated;

commit;
