alter table public.education_admissions
  add column if not exists decision_note text,
  add column if not exists enrolled_student_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.education_admissions'::regclass
      and conname = 'education_admissions_decision_note_length_check'
  ) then
    alter table public.education_admissions
      add constraint education_admissions_decision_note_length_check
      check (decision_note is null or char_length(btrim(decision_note)) <= 1000);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.education_admissions'::regclass
      and conname = 'education_admissions_enrolled_student_fkey'
  ) then
    alter table public.education_admissions
      add constraint education_admissions_enrolled_student_fkey
      foreign key (org_id, enrolled_student_id)
      references public.education_students(org_id, id) on delete restrict;
  end if;
end;
$$;

create index if not exists education_admissions_enrolled_student_idx
  on public.education_admissions (org_id, enrolled_student_id)
  where enrolled_student_id is not null;

revoke update on public.education_admissions from authenticated;
revoke insert on public.education_admissions from authenticated;
grant insert (
  org_id, branch_id, application_number, applicant_first_name, applicant_last_name,
  applicant_email, applicant_phone, requested_class_id
) on public.education_admissions to authenticated;

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
        (old.status = 'pending' and new.status in ('under_review', 'withdrawn'))
        or (old.status = 'under_review' and new.status in ('admitted', 'rejected', 'withdrawn'))
        or (old.status = 'admitted' and new.status in ('enrolled', 'withdrawn'))
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
        select 1 from public.education_results result
        where result.org_id = old.org_id and result.examination_id = old.id
      ) or exists (
        select 1 from public.education_results result
        where result.org_id = old.org_id and result.examination_id = old.id
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
          select 1 from public.education_students student
          where student.org_id = new.org_id and student.id = new.student_id
            and student.branch_id = new.destination_branch_id
        )
        or not exists (
          select 1 from public.audit_logs log
          where log.org_id = new.org_id and log.entity_type = 'education_student_transfer'
            and log.entity_id = new.id and log.action = 'completed'
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
      org_id, branch_id, student_number, first_name, last_name, email, phone, status, created_by
    ) values (
      p_org_id, admission_row.branch_id, btrim(p_student_number),
      admission_row.applicant_first_name, admission_row.applicant_last_name,
      admission_row.applicant_email, admission_row.applicant_phone, 'active', auth.uid()
    )
    returning id into student_id;

    insert into public.education_student_enrollments (
      org_id, branch_id, student_id, class_id, academic_year_id, status, enrolled_on
    ) values (
      p_org_id, admission_row.branch_id, student_id, class_row.id,
      class_row.academic_year_id, 'active', current_date
    );
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
      'class_id', case when p_status = 'enrolled' then class_row.id else null end
    )
  );
  return coalesce(student_id, p_admission_id);
end;
$$;

revoke all on function public.education_process_admission(uuid, uuid, text, text, text, uuid)
  from public, anon;
grant execute on function public.education_process_admission(uuid, uuid, text, text, text, uuid)
  to authenticated;
