begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'education_timetable_entries_org_branch_id_unique'
      and conrelid = 'public.education_timetable_entries'::regclass
  ) then
    alter table public.education_timetable_entries
      add constraint education_timetable_entries_org_branch_id_unique
      unique (org_id, branch_id, id);
  end if;
end;
$$;

create table public.education_lesson_attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  timetable_entry_id uuid not null,
  student_id uuid not null,
  attendance_date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, timetable_entry_id, attendance_date, student_id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, branch_id, timetable_entry_id)
    references public.education_timetable_entries(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict
);

create index education_lesson_attendance_branch_date_idx
  on public.education_lesson_attendance (org_id, branch_id, attendance_date desc, timetable_entry_id);
create index education_lesson_attendance_student_date_idx
  on public.education_lesson_attendance (org_id, student_id, attendance_date desc);

alter table public.education_lesson_attendance enable row level security;
create policy "education lesson attendance read"
  on public.education_lesson_attendance for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_attendance', 'view'));

revoke all on public.education_lesson_attendance from anon;
grant select on public.education_lesson_attendance to authenticated;
revoke insert, update, delete on public.education_lesson_attendance from authenticated;

create or replace function public.education_record_lesson_attendance(
  p_org_id uuid,
  p_timetable_entry_id uuid,
  p_student_id uuid,
  p_attendance_date date,
  p_status text,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  timetable_row public.education_timetable_entries%rowtype;
  attendance_row public.education_lesson_attendance%rowtype;
  attendance_action text;
  saved_attendance_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to record lesson attendance.' using errcode = '42501';
  end if;
  if p_org_id is null or p_timetable_entry_id is null or p_student_id is null
    or p_attendance_date is null
    or p_status is null or p_status not in ('present', 'absent', 'late', 'excused')
    or p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception 'The lesson attendance details are invalid.' using errcode = '22023';
  end if;

  select * into timetable_row
  from public.education_timetable_entries
  where org_id = p_org_id and id = p_timetable_entry_id
  for update;
  if not found or timetable_row.status <> 'active' then
    raise exception 'The selected timetable lesson is not active.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(
    p_org_id, timetable_row.branch_id, 'education_timetables', 'view'
  ) or not public.education_can_access_branch(
    p_org_id, timetable_row.branch_id, 'education_students', 'view'
  ) then
    raise exception 'Timetable and student roster view access is required for lesson attendance.' using errcode = '42501';
  end if;
  if extract(isodow from p_attendance_date)::smallint <> timetable_row.weekday then
    raise exception 'The attendance date does not match the lesson weekday.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.education_academic_years academic_year
    where academic_year.org_id = p_org_id
      and academic_year.id = timetable_row.academic_year_id
      and p_attendance_date between academic_year.starts_on and academic_year.ends_on
  ) then
    raise exception 'The attendance date is outside the lesson academic year.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.education_student_enrollments enrollment
    join public.education_students student
      on student.org_id = enrollment.org_id
      and student.branch_id = enrollment.branch_id
      and student.id = enrollment.student_id
    where enrollment.org_id = p_org_id
      and enrollment.branch_id = timetable_row.branch_id
      and enrollment.class_id = timetable_row.class_id
      and enrollment.academic_year_id = timetable_row.academic_year_id
      and enrollment.student_id = p_student_id
      and enrollment.status = 'active'
      and enrollment.enrolled_on <= p_attendance_date
      and (enrollment.ended_on is null or enrollment.ended_on >= p_attendance_date)
      and student.status = 'active'
  ) then
    raise exception 'The student is not actively enrolled in this lesson class.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_org_id::text),
    hashtext(p_timetable_entry_id::text || p_attendance_date::text || p_student_id::text)
  );
  select * into attendance_row
  from public.education_lesson_attendance
  where org_id = p_org_id
    and timetable_entry_id = p_timetable_entry_id
    and attendance_date = p_attendance_date
    and student_id = p_student_id
  for update;
  attendance_action := case when found then 'edit' else 'create' end;
  if not public.education_can_access_branch(
    p_org_id, timetable_row.branch_id, 'education_attendance', attendance_action
  ) then
    raise exception 'You are not authorized to record lesson attendance at this campus.' using errcode = '42501';
  end if;

  if attendance_action = 'edit' then
    update public.education_lesson_attendance
    set status = p_status,
        note = nullif(btrim(p_note), ''),
        recorded_by = auth.uid(),
        updated_at = now()
    where org_id = p_org_id and id = attendance_row.id
    returning id into saved_attendance_id;
  else
    insert into public.education_lesson_attendance (
      org_id, branch_id, timetable_entry_id, student_id, attendance_date,
      status, note, recorded_by
    ) values (
      p_org_id, timetable_row.branch_id, p_timetable_entry_id, p_student_id, p_attendance_date,
      p_status, nullif(btrim(p_note), ''), auth.uid()
    ) returning id into saved_attendance_id;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(),
    case when attendance_action = 'edit' then 'education_lesson_attendance_updated' else 'education_lesson_attendance_recorded' end,
    'education_lesson_attendance', saved_attendance_id,
    jsonb_build_object(
      'branch_id', timetable_row.branch_id,
      'timetable_entry_id', p_timetable_entry_id,
      'student_id', p_student_id,
      'attendance_date', p_attendance_date,
      'status', p_status
    )
  );
  return saved_attendance_id;
end;
$$;

revoke all on function public.education_record_lesson_attendance(uuid, uuid, uuid, date, text, text) from public, anon;
grant execute on function public.education_record_lesson_attendance(uuid, uuid, uuid, date, text, text) to authenticated;

commit;
