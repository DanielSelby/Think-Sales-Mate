begin;

alter table public.education_students
  add column if not exists home_address text
    check (home_address is null or char_length(home_address) <= 500);

alter table public.education_admissions
  add column if not exists applicant_other_names text
    check (applicant_other_names is null or char_length(applicant_other_names) <= 100),
  add column if not exists applicant_date_of_birth date,
  add column if not exists applicant_gender text
    check (applicant_gender is null or char_length(applicant_gender) <= 50),
  add column if not exists applicant_address text
    check (applicant_address is null or char_length(applicant_address) <= 500),
  add column if not exists guardian_first_name text
    check (guardian_first_name is null or char_length(btrim(guardian_first_name)) between 1 and 100),
  add column if not exists guardian_last_name text
    check (guardian_last_name is null or char_length(btrim(guardian_last_name)) between 1 and 100),
  add column if not exists guardian_email text,
  add column if not exists guardian_phone text
    check (guardian_phone is null or char_length(guardian_phone) <= 40),
  add column if not exists guardian_relationship text
    check (guardian_relationship is null or char_length(btrim(guardian_relationship)) between 1 and 60),
  add constraint education_admissions_guardian_details_check check (
    (guardian_first_name is null and guardian_last_name is null
      and guardian_email is null and guardian_phone is null and guardian_relationship is null)
    or (guardian_first_name is not null and guardian_last_name is not null
      and guardian_relationship is not null
      and (guardian_email is not null or guardian_phone is not null))
  ),
  add constraint education_admissions_guardian_email_check check (
    guardian_email is null or (
      char_length(guardian_email) <= 254
      and btrim(guardian_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  add constraint education_admissions_birth_date_check check (
    applicant_date_of_birth is null or applicant_date_of_birth <= current_date
  );

create table if not exists public.education_student_consent_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  student_id uuid not null,
  consent_type text not null check (consent_type ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  disclosure_version text not null check (char_length(btrim(disclosure_version)) between 1 and 120),
  decision text not null check (decision in ('granted', 'denied', 'withdrawn')),
  signer_name text not null check (char_length(btrim(signer_name)) between 1 and 150),
  signer_relationship text not null check (char_length(btrim(signer_relationship)) between 1 and 80),
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 500),
  recorded_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  recorded_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict
);

create index if not exists education_student_consent_events_student_idx
  on public.education_student_consent_events (org_id, branch_id, student_id, consent_type, recorded_at desc);

alter table public.education_student_consent_events enable row level security;

create policy "education student consent events read"
  on public.education_student_consent_events for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_students', 'view'));

revoke all on public.education_student_consent_events from anon, authenticated;
grant select on public.education_student_consent_events to authenticated;

create or replace function public.education_process_admission(
  p_org_id uuid,
  p_admission_id uuid,
  p_status text,
  p_decision_note text default null,
  p_student_number text default null,
  p_class_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  admission_row public.education_admissions%rowtype;
  class_row public.education_classes%rowtype;
  year_status text;
  student_id uuid;
  guardian_id uuid;
  required_action text;
begin
  if auth.uid() is null or p_org_id is null or p_admission_id is null
    or p_status is null or p_status not in ('under_review', 'admitted', 'rejected', 'withdrawn', 'enrolled')
    or (p_decision_note is not null and char_length(btrim(p_decision_note)) > 1000)
    or (p_status in ('rejected', 'withdrawn') and nullif(btrim(p_decision_note), '') is null)
    or (p_status = 'enrolled' and (
      p_student_number is null
      or btrim(p_student_number) !~ '^[A-Za-z0-9._/-]{1,32}$'
      or p_class_id is null
    ))
    or (p_status <> 'enrolled' and (p_student_number is not null or p_class_id is not null)) then
    raise exception 'Admission workflow details are invalid.' using errcode = '22023';
  end if;

  select application.* into admission_row
  from public.education_admissions application
  where application.org_id = p_org_id
    and application.id = p_admission_id
  for update;
  if not found then
    raise exception 'The application was not found.' using errcode = 'P0002';
  end if;

  required_action := case
    when p_status in ('admitted', 'rejected', 'enrolled') then 'approve'
    else 'edit'
  end;
  if not public.education_can_access_branch(p_org_id, admission_row.branch_id, 'education_admissions', required_action)
    or (required_action = 'approve'
      and not public.education_can_access_branch(p_org_id, admission_row.branch_id, 'education_admissions', 'edit')) then
    raise exception 'You cannot process this application at the selected campus.'
      using errcode = '42501';
  end if;

  if (p_status = 'under_review' and admission_row.status <> 'pending')
    or (p_status in ('admitted', 'rejected') and admission_row.status <> 'under_review')
    or (p_status = 'withdrawn' and admission_row.status not in ('pending', 'under_review', 'admitted'))
    or (p_status = 'enrolled' and admission_row.status <> 'admitted') then
    raise exception 'Admission status transition is not available.' using errcode = '22023';
  end if;

  if p_status = 'enrolled' then
    if not public.education_can_access_branch(p_org_id, admission_row.branch_id, 'education_students', 'create')
      or not public.education_can_access_branch(p_org_id, admission_row.branch_id, 'education_academics', 'view') then
      raise exception 'Student creation and academic view access are required to enroll this applicant.'
        using errcode = '42501';
    end if;

    if admission_row.guardian_first_name is not null
      and not public.education_can_access_branch(p_org_id, admission_row.branch_id, 'education_guardians', 'create') then
      raise exception 'Guardian creation access is required to enroll an applicant with guardian details.'
        using errcode = '42501';
    end if;

    select classroom.* into class_row
    from public.education_classes classroom
    where classroom.org_id = p_org_id
      and classroom.id = p_class_id
      and classroom.branch_id = admission_row.branch_id
      and classroom.status = 'active'
    for update;
    if not found then
      raise exception 'The selected class is not active at the application campus.'
        using errcode = '22023';
    end if;

    select year.status into year_status
    from public.education_academic_years year
    where year.org_id = p_org_id and year.id = class_row.academic_year_id;
    if year_status is distinct from 'active' then
      raise exception 'The selected class must belong to an active academic year.'
        using errcode = '22023';
    end if;

    if class_row.capacity is not null and (
      select count(*)
      from public.education_student_enrollments enrollment
      where enrollment.org_id = p_org_id
        and enrollment.class_id = class_row.id
        and enrollment.status = 'active'
    ) >= class_row.capacity then
      raise exception 'The selected class has reached capacity.' using errcode = '23514';
    end if;

    insert into public.education_students (
      org_id, branch_id, student_number, first_name, last_name, other_names,
      email, phone, date_of_birth, gender, home_address, status, created_by
    ) values (
      p_org_id, admission_row.branch_id, btrim(p_student_number),
      admission_row.applicant_first_name, admission_row.applicant_last_name,
      admission_row.applicant_other_names, admission_row.applicant_email,
      admission_row.applicant_phone, admission_row.applicant_date_of_birth,
      admission_row.applicant_gender, admission_row.applicant_address,
      'active', auth.uid()
    )
    returning id into student_id;

    insert into public.education_student_enrollments (
      org_id, branch_id, student_id, class_id, academic_year_id, status, enrolled_on
    ) values (
      p_org_id, admission_row.branch_id, student_id, class_row.id,
      class_row.academic_year_id, 'active', current_date
    );

    if admission_row.guardian_first_name is not null then
      insert into public.education_guardians (
        org_id, first_name, last_name, email, phone, created_by
      ) values (
        p_org_id, btrim(admission_row.guardian_first_name), btrim(admission_row.guardian_last_name),
        nullif(lower(btrim(admission_row.guardian_email)), ''),
        nullif(btrim(admission_row.guardian_phone), ''), auth.uid()
      )
      returning id into guardian_id;

      insert into public.education_student_guardians (
        org_id, branch_id, student_id, guardian_id, relationship, is_primary, created_by
      ) values (
        p_org_id, admission_row.branch_id, student_id, guardian_id,
        btrim(admission_row.guardian_relationship), true, auth.uid()
      );
    end if;
  end if;

  update public.education_admissions
  set status = p_status,
      reviewed_by = case when p_status = 'under_review' then reviewed_by else auth.uid() end,
      reviewed_at = case when p_status = 'under_review' then reviewed_at else now() end,
      decision_note = case
        when p_decision_note is not null then nullif(btrim(p_decision_note), '')
        else decision_note
      end,
      requested_class_id = case when p_status = 'enrolled' then class_row.id else requested_class_id end,
      enrolled_student_id = case when p_status = 'enrolled' then student_id else enrolled_student_id end
  where org_id = p_org_id and id = p_admission_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_admission_' || p_status,
    'education_admission', p_admission_id,
    jsonb_build_object(
      'branch_id', admission_row.branch_id,
      'previous_status', admission_row.status,
      'status', p_status,
      'decision_note', nullif(btrim(p_decision_note), ''),
      'student_id', student_id,
      'guardian_id', guardian_id,
      'class_id', case when p_status = 'enrolled' then class_row.id else null end
    )
  );
  return coalesce(student_id, p_admission_id);
end;
$$;

create or replace function public.education_record_student_consent(
  p_org_id uuid,
  p_student_id uuid,
  p_consent_type text,
  p_disclosure_version text,
  p_decision text,
  p_signer_name text,
  p_signer_relationship text,
  p_evidence_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  student_row public.education_students%rowtype;
  latest_decision text;
  event_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_student_id is null
    or p_consent_type is null or p_consent_type !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    or p_disclosure_version is null or char_length(btrim(p_disclosure_version)) not between 1 and 120
    or p_decision is null or p_decision not in ('granted', 'denied', 'withdrawn')
    or p_signer_name is null or char_length(btrim(p_signer_name)) not between 1 and 150
    or p_signer_relationship is null or char_length(btrim(p_signer_relationship)) not between 1 and 80
    or char_length(coalesce(p_evidence_note, '')) > 500 then
    raise exception 'Consent record details are invalid.' using errcode = '22023';
  end if;

  select student.* into student_row
  from public.education_students student
  where student.org_id = p_org_id and student.id = p_student_id
  for update;
  if not found then
    raise exception 'The student was not found.' using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(p_org_id, student_row.branch_id, 'education_students', 'edit') then
    raise exception 'You are not authorized to record consent for this student.'
      using errcode = '42501';
  end if;

  if p_decision = 'withdrawn' then
    select event.decision into latest_decision
    from public.education_student_consent_events event
    where event.org_id = p_org_id
      and event.student_id = p_student_id
      and event.consent_type = p_consent_type
    order by event.recorded_at desc, event.id desc
    limit 1;
    if latest_decision is distinct from 'granted' then
      raise exception 'Only an active granted consent can be withdrawn.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.education_student_consent_events (
    org_id, branch_id, student_id, consent_type, disclosure_version,
    decision, signer_name, signer_relationship, evidence_note, recorded_by
  ) values (
    p_org_id, student_row.branch_id, p_student_id, p_consent_type, btrim(p_disclosure_version),
    p_decision, btrim(p_signer_name), btrim(p_signer_relationship),
    nullif(btrim(p_evidence_note), ''), auth.uid()
  ) returning id into event_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_student_consent_' || p_decision,
    'education_student_consent_event', event_id,
    jsonb_build_object(
      'branch_id', student_row.branch_id,
      'student_id', p_student_id,
      'consent_type', p_consent_type,
      'disclosure_version', btrim(p_disclosure_version)
    )
  );
  return event_id;
end;
$$;

revoke all on function public.education_record_student_consent(uuid, uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.education_record_student_consent(uuid, uuid, text, text, text, text, text, text)
  to authenticated;

commit;
