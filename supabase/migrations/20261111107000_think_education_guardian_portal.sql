begin;

alter table public.education_students
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists education_students_org_user_unique_idx
  on public.education_students (org_id, user_id)
  where user_id is not null;

drop policy if exists "education guardians read"
  on public.education_guardians;

create policy "education guardians read"
  on public.education_guardians for select
  using (
    (
      public.education_guardian_user_can_view(org_id, id)
      and public.has_product_access(org_id, 'think-education', false)
      and exists (
        select 1
        from public.organizations organization
        where organization.id = education_guardians.org_id
          and organization.registration_status = 'approved'
      )
    )
    or exists (
      select 1
      from public.education_student_guardians relationship
      where relationship.org_id = education_guardians.org_id
        and relationship.guardian_id = education_guardians.id
        and public.education_can_access_branch(
          relationship.org_id, relationship.branch_id, 'education_guardians', 'view'
        )
    )
  );

drop policy if exists "education guardian relationships read"
  on public.education_student_guardians;

create policy "education guardian relationships read"
  on public.education_student_guardians for select
  using (
    public.education_can_access_branch(org_id, branch_id, 'education_guardians', 'view')
    or (
      status = 'verified'
      and public.education_guardian_user_can_view(org_id, guardian_id)
      and public.has_product_access(org_id, 'think-education', false)
      and exists (
        select 1
        from public.organizations organization
        where organization.id = education_student_guardians.org_id
          and organization.registration_status = 'approved'
      )
    )
  );

create or replace function public.education_claim_guardian_account()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  verified_email text;
  verified_at timestamptz;
  guardian_row record;
  claimed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Sign in with a verified email address to link your guardian profile.'
      using errcode = '42501';
  end if;

  select lower(btrim(auth_user.email)), auth_user.email_confirmed_at
    into verified_email, verified_at
  from auth.users auth_user
  where auth_user.id = current_user_id;

  if verified_email is null or verified_at is null then
    raise exception 'Verify your email address before linking your guardian profile.'
      using errcode = '42501';
  end if;

  for guardian_row in
    select guardian.id, guardian.org_id
    from public.education_guardians guardian
    where lower(btrim(guardian.email)) = verified_email
      and guardian.status = 'active'
      and guardian.user_id is null
      and public.has_product_access(guardian.org_id, 'think-education', false)
      and exists (
        select 1
        from public.organizations organization
        where organization.id = guardian.org_id
          and organization.registration_status = 'approved'
      )
      and not exists (
        select 1
        from public.education_guardians already_linked
        where already_linked.org_id = guardian.org_id
          and already_linked.user_id = current_user_id
      )
      and guardian.id = (
        select candidate.id
        from public.education_guardians candidate
        where candidate.org_id = guardian.org_id
          and lower(btrim(candidate.email)) = verified_email
          and candidate.status = 'active'
          and candidate.user_id is null
          and exists (
            select 1
            from public.education_student_guardians candidate_relationship
            where candidate_relationship.org_id = candidate.org_id
              and candidate_relationship.guardian_id = candidate.id
              and candidate_relationship.status = 'verified'
          )
        order by candidate.created_at, candidate.id
        limit 1
      )
      and exists (
        select 1
        from public.education_student_guardians relationship
        where relationship.org_id = guardian.org_id
          and relationship.guardian_id = guardian.id
          and relationship.status = 'verified'
      )
    order by guardian.org_id, guardian.id
    for update of guardian
  loop
    update public.education_guardians
    set user_id = current_user_id, updated_at = now()
    where org_id = guardian_row.org_id
      and id = guardian_row.id
      and user_id is null;

    if found then
      insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
      values (
        guardian_row.org_id,
        current_user_id,
        'guardian_account_linked',
        'education_guardian',
        guardian_row.id,
        jsonb_build_object('email_verified', true)
      );
      claimed_count := claimed_count + 1;
    end if;
  end loop;

  return claimed_count;
end;
$$;

create or replace function public.education_claim_student_account()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  verified_email text;
  verified_at timestamptz;
  student_row record;
  claimed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Sign in with a verified email address to link your student profile.'
      using errcode = '42501';
  end if;

  select lower(btrim(auth_user.email)), auth_user.email_confirmed_at
    into verified_email, verified_at
  from auth.users auth_user
  where auth_user.id = current_user_id;

  if verified_email is null or verified_at is null then
    raise exception 'Verify your email address before linking your student profile.'
      using errcode = '42501';
  end if;

  for student_row in
    select student.id, student.org_id
    from public.education_students student
    where lower(btrim(student.email)) = verified_email
      and student.status = 'active'
      and student.user_id is null
      and public.has_product_access(student.org_id, 'think-education', false)
      and exists (
        select 1
        from public.organizations organization
        where organization.id = student.org_id
          and organization.registration_status = 'approved'
      )
      and not exists (
        select 1
        from public.education_students already_linked
        where already_linked.org_id = student.org_id
          and already_linked.user_id = current_user_id
      )
      and student.id = (
        select candidate.id
        from public.education_students candidate
        where candidate.org_id = student.org_id
          and lower(btrim(candidate.email)) = verified_email
          and candidate.status = 'active'
          and candidate.user_id is null
        order by candidate.created_at, candidate.id
        limit 1
      )
    order by student.org_id, student.id
    for update of student
  loop
    update public.education_students
    set user_id = current_user_id, updated_at = now()
    where org_id = student_row.org_id
      and id = student_row.id
      and user_id is null;

    if found then
      insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
      values (
        student_row.org_id,
        current_user_id,
        'student_account_linked',
        'education_student',
        student_row.id,
        jsonb_build_object('email_verified', true)
      );
      claimed_count := claimed_count + 1;
    end if;
  end loop;

  return claimed_count;
end;
$$;

create or replace function public.education_get_guardian_portal()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with linked_guardians as (
    select
      guardian.id,
      guardian.org_id,
      guardian.first_name,
      guardian.last_name,
      guardian.email,
      organization.name as organization_name,
      upper(organization.currency) as currency_code
    from public.education_guardians guardian
    join public.organizations organization on organization.id = guardian.org_id
    where guardian.user_id = auth.uid()
      and guardian.status = 'active'
      and organization.registration_status = 'approved'
      and public.has_product_access(guardian.org_id, 'think-education', false)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'organizationId', guardian.org_id,
        'organizationName', guardian.organization_name,
        'currencyCode', guardian.currency_code,
        'guardianFirstName', guardian.first_name,
        'guardianLastName', guardian.last_name,
        'children', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', student.id,
              'studentNumber', student.student_number,
              'firstName', student.first_name,
              'lastName', student.last_name,
              'otherNames', student.other_names,
              'status', student.status,
              'campusName', location.name,
              'className', current_class.class_name,
              'attendance', jsonb_build_object(
                'present', coalesce(attendance.present_count, 0),
                'absent', coalesce(attendance.absent_count, 0),
                'late', coalesce(attendance.late_count, 0),
                'excused', coalesce(attendance.excused_count, 0)
              ),
              'feeBalance', coalesce(fees.balance, 0),
              'fees', coalesce(fees.items, '[]'::jsonb),
              'results', coalesce(results.items, '[]'::jsonb),
              'timetable', coalesce(timetable.items, '[]'::jsonb)
            )
            order by student.last_name, student.first_name, student.id
          )
          from public.education_student_guardians relationship
          join public.education_students student
            on student.org_id = relationship.org_id
            and student.branch_id = relationship.branch_id
            and student.id = relationship.student_id
          join public.business_locations location
            on location.org_id = student.org_id
            and location.id = student.branch_id
          left join lateral (
            select class.name as class_name
            from public.education_student_enrollments enrollment
            join public.education_classes class
              on class.org_id = enrollment.org_id
              and class.branch_id = enrollment.branch_id
              and class.id = enrollment.class_id
            join public.education_academic_years academic_year
              on academic_year.org_id = enrollment.org_id
              and academic_year.id = enrollment.academic_year_id
            where enrollment.org_id = student.org_id
              and enrollment.branch_id = student.branch_id
              and enrollment.student_id = student.id
              and enrollment.status = 'active'
              and academic_year.status = 'active'
              and class.status = 'active'
            order by enrollment.enrolled_on desc, enrollment.created_at desc
            limit 1
          ) current_class on true
          left join lateral (
            select
              count(*) filter (where attendance_row.status = 'present') as present_count,
              count(*) filter (where attendance_row.status = 'absent') as absent_count,
              count(*) filter (where attendance_row.status = 'late') as late_count,
              count(*) filter (where attendance_row.status = 'excused') as excused_count
            from public.education_attendance attendance_row
            where attendance_row.org_id = student.org_id
              and attendance_row.branch_id = student.branch_id
              and attendance_row.student_id = student.id
              and attendance_row.attendance_date >= current_date - 29
              and attendance_row.attendance_date <= current_date
          ) attendance on true
          left join lateral (
            select
              sum(charge_balance.balance) as balance,
              jsonb_agg(
                jsonb_build_object(
                  'description', charge_balance.description,
                  'dueOn', charge_balance.due_on,
                  'amount', charge_balance.amount,
                  'paid', charge_balance.paid,
                  'balance', charge_balance.balance
                )
                order by charge_balance.due_on nulls last, charge_balance.created_at desc
              ) as items
            from (
              select
                charge.description,
                charge.due_on,
                charge.amount,
                coalesce(payment_totals.paid, 0) as paid,
                greatest(charge.amount - coalesce(payment_totals.paid, 0), 0) as balance,
                charge.created_at
              from public.education_fee_charges charge
              left join lateral (
                select sum(payment.amount) as paid
                from public.education_fee_payments payment
                where payment.org_id = charge.org_id
                  and payment.charge_id = charge.id
              ) payment_totals on true
              where charge.org_id = student.org_id
                and charge.branch_id = student.branch_id
                and charge.student_id = student.id
                and charge.status = 'open'
            ) charge_balance
          ) fees on true
          left join lateral (
            select jsonb_agg(
              jsonb_build_object(
                'examination', result_rows.examination_name,
                'subject', result_rows.subject_name,
                'score', result_rows.score,
                'maximumScore', result_rows.maximum_score,
                'grade', result_rows.grade,
                'publishedAt', result_rows.updated_at
              )
              order by result_rows.updated_at desc
            ) as items
            from (
              select
                examination.name as examination_name,
                result.subject_name,
                result.score,
                result.maximum_score,
                result.grade,
                result.updated_at
              from public.education_results result
              join public.education_examinations examination
                on examination.org_id = result.org_id
                and examination.branch_id = result.branch_id
                and examination.id = result.examination_id
              where result.org_id = student.org_id
                and result.branch_id = student.branch_id
                and result.student_id = student.id
                and result.status = 'published'
                and examination.status = 'published'
              order by result.updated_at desc
              limit 12
            ) result_rows
          ) results on true
          left join lateral (
            select jsonb_agg(
              jsonb_build_object(
                'subject', timetable_entry.subject_name,
                'weekday', timetable_entry.weekday,
                'startsAt', timetable_entry.starts_at,
                'endsAt', timetable_entry.ends_at,
                'room', timetable_entry.room
              )
              order by timetable_entry.weekday, timetable_entry.starts_at
            ) as items
            from public.education_student_enrollments enrollment
            join public.education_classes class
              on class.org_id = enrollment.org_id
              and class.branch_id = enrollment.branch_id
              and class.id = enrollment.class_id
            join public.education_academic_years academic_year
              on academic_year.org_id = enrollment.org_id
              and academic_year.id = enrollment.academic_year_id
            join public.education_timetable_entries timetable_entry
              on timetable_entry.org_id = class.org_id
              and timetable_entry.branch_id = class.branch_id
              and timetable_entry.class_id = class.id
              and timetable_entry.academic_year_id = enrollment.academic_year_id
            where enrollment.org_id = student.org_id
              and enrollment.branch_id = student.branch_id
              and enrollment.student_id = student.id
              and enrollment.status = 'active'
              and academic_year.status = 'active'
              and class.status = 'active'
              and timetable_entry.status = 'active'
          ) timetable on true
          where relationship.org_id = guardian.org_id
            and relationship.guardian_id = guardian.id
            and relationship.status = 'verified'
        ), '[]'::jsonb)
      )
      order by guardian.organization_name, guardian.last_name, guardian.first_name
    ),
    '[]'::jsonb
  )
  from linked_guardians guardian;
$$;

create or replace function public.education_get_student_portal()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with linked_students as (
    select
      student.id,
      student.org_id,
      student.branch_id,
      student.student_number,
      student.first_name,
      student.last_name,
      student.other_names,
      student.status,
      organization.name as organization_name,
      upper(organization.currency) as currency_code,
      location.name as campus_name
    from public.education_students student
    join public.organizations organization on organization.id = student.org_id
    join public.business_locations location
      on location.org_id = student.org_id
      and location.id = student.branch_id
    where student.user_id = auth.uid()
      and student.status = 'active'
      and organization.registration_status = 'approved'
      and public.has_product_access(student.org_id, 'think-education', false)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', student.id,
        'organizationId', student.org_id,
        'organizationName', student.organization_name,
        'currencyCode', student.currency_code,
        'campusName', student.campus_name,
        'studentNumber', student.student_number,
        'firstName', student.first_name,
        'lastName', student.last_name,
        'otherNames', student.other_names,
        'className', current_class.class_name,
        'attendance', jsonb_build_object(
          'present', coalesce(attendance.present_count, 0),
          'absent', coalesce(attendance.absent_count, 0),
          'late', coalesce(attendance.late_count, 0),
          'excused', coalesce(attendance.excused_count, 0)
        ),
        'results', coalesce(results.items, '[]'::jsonb),
        'timetable', coalesce(timetable.items, '[]'::jsonb)
      )
      order by student.organization_name, student.last_name, student.first_name
    ),
    '[]'::jsonb
  )
  from linked_students student
  left join lateral (
    select class.name as class_name
    from public.education_student_enrollments enrollment
    join public.education_classes class
      on class.org_id = enrollment.org_id
      and class.branch_id = enrollment.branch_id
      and class.id = enrollment.class_id
    join public.education_academic_years academic_year
      on academic_year.org_id = enrollment.org_id
      and academic_year.id = enrollment.academic_year_id
    where enrollment.org_id = student.org_id
      and enrollment.branch_id = student.branch_id
      and enrollment.student_id = student.id
      and enrollment.status = 'active'
      and academic_year.status = 'active'
      and class.status = 'active'
    order by enrollment.enrolled_on desc, enrollment.created_at desc
    limit 1
  ) current_class on true
  left join lateral (
    select
      count(*) filter (where attendance_row.status = 'present') as present_count,
      count(*) filter (where attendance_row.status = 'absent') as absent_count,
      count(*) filter (where attendance_row.status = 'late') as late_count,
      count(*) filter (where attendance_row.status = 'excused') as excused_count
    from public.education_attendance attendance_row
    where attendance_row.org_id = student.org_id
      and attendance_row.branch_id = student.branch_id
      and attendance_row.student_id = student.id
      and attendance_row.attendance_date >= current_date - 29
      and attendance_row.attendance_date <= current_date
  ) attendance on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'examination', result_rows.examination_name,
        'subject', result_rows.subject_name,
        'score', result_rows.score,
        'maximumScore', result_rows.maximum_score,
        'grade', result_rows.grade,
        'publishedAt', result_rows.updated_at
      )
      order by result_rows.updated_at desc
    ) as items
    from (
      select
        examination.name as examination_name,
        result.subject_name,
        result.score,
        result.maximum_score,
        result.grade,
        result.updated_at
      from public.education_results result
      join public.education_examinations examination
        on examination.org_id = result.org_id
        and examination.branch_id = result.branch_id
        and examination.id = result.examination_id
      where result.org_id = student.org_id
        and result.branch_id = student.branch_id
        and result.student_id = student.id
        and result.status = 'published'
        and examination.status = 'published'
      order by result.updated_at desc
      limit 12
    ) result_rows
  ) results on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'subject', timetable_entry.subject_name,
        'weekday', timetable_entry.weekday,
        'startsAt', timetable_entry.starts_at,
        'endsAt', timetable_entry.ends_at,
        'room', timetable_entry.room
      )
      order by timetable_entry.weekday, timetable_entry.starts_at
    ) as items
    from public.education_student_enrollments enrollment
    join public.education_classes class
      on class.org_id = enrollment.org_id
      and class.branch_id = enrollment.branch_id
      and class.id = enrollment.class_id
    join public.education_academic_years academic_year
      on academic_year.org_id = enrollment.org_id
      and academic_year.id = enrollment.academic_year_id
    join public.education_timetable_entries timetable_entry
      on timetable_entry.org_id = class.org_id
      and timetable_entry.branch_id = class.branch_id
      and timetable_entry.class_id = class.id
      and timetable_entry.academic_year_id = enrollment.academic_year_id
    where enrollment.org_id = student.org_id
      and enrollment.branch_id = student.branch_id
      and enrollment.student_id = student.id
      and enrollment.status = 'active'
      and academic_year.status = 'active'
      and class.status = 'active'
      and timetable_entry.status = 'active'
  ) timetable on true;
$$;

revoke all on function public.education_claim_guardian_account() from public, anon;
grant execute on function public.education_claim_guardian_account() to authenticated;
revoke all on function public.education_get_guardian_portal() from public, anon;
grant execute on function public.education_get_guardian_portal() to authenticated;
revoke all on function public.education_claim_student_account() from public, anon;
grant execute on function public.education_claim_student_account() to authenticated;
revoke all on function public.education_get_student_portal() from public, anon;
grant execute on function public.education_get_student_portal() to authenticated;

commit;
