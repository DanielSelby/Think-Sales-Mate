begin;

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
    select student.id, student.org_id, student.user_id as previous_user_id
    from public.education_students student
    where lower(btrim(student.email)) = verified_email
      and student.status = 'active'
      and (
        student.user_id is null
        or not exists (
          select 1
          from auth.users linked_user
          where linked_user.id = student.user_id
            and lower(btrim(linked_user.email)) = verified_email
        )
      )
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
          and (
            candidate.user_id is null
            or not exists (
              select 1
              from auth.users linked_user
              where linked_user.id = candidate.user_id
                and lower(btrim(linked_user.email)) = verified_email
            )
          )
          and public.has_product_access(candidate.org_id, 'think-education', false)
          and exists (
            select 1
            from public.organizations organization
            where organization.id = candidate.org_id
              and organization.registration_status = 'approved'
          )
        order by candidate.created_at, candidate.id
        limit 1
      )
    order by student.org_id, student.id
    for update of student
  loop
    update public.education_students as student
    set user_id = current_user_id, updated_at = now()
    where student.org_id = student_row.org_id
      and student.id = student_row.id
      and student.user_id is not distinct from student_row.previous_user_id
      and (
        student.user_id is null
        or not exists (
          select 1
          from auth.users linked_user
          where linked_user.id = student.user_id
            and lower(btrim(linked_user.email)) = verified_email
        )
      );

    if found then
      insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
      values (
        student_row.org_id,
        current_user_id,
        'student_account_linked',
        'education_student',
        student_row.id,
        jsonb_build_object(
          'email_verified', true,
          'relinked_existing_account', student_row.previous_user_id is not null
        )
      );
      claimed_count := claimed_count + 1;
    end if;
  end loop;

  return claimed_count;
end;
$$;

revoke all on function public.education_claim_student_account() from public, anon;
grant execute on function public.education_claim_student_account() to authenticated;

commit;
