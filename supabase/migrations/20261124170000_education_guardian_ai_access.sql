begin;

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
      select 1
      from public.education_students student
      where student.org_id = p_org_id
        and student.id = p_student_id
        and student.status = 'active'
        and (
          student.user_id = p_user_id
          or exists (
            select 1
            from public.education_guardians guardian
            join public.education_student_guardians relationship
              on relationship.org_id = guardian.org_id
              and relationship.guardian_id = guardian.id
              and relationship.branch_id = student.branch_id
              and relationship.student_id = student.id
              and relationship.status = 'verified'
            join public.organizations organization
              on organization.id = guardian.org_id
              and organization.registration_status = 'approved'
            where guardian.org_id = p_org_id
              and guardian.user_id = p_user_id
              and guardian.status = 'active'
              and public.has_product_access(guardian.org_id, 'think-education', false)
          )
        )
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

revoke all on function public.education_reserve_student_ai_request(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.education_reserve_student_ai_request(uuid, uuid, uuid)
  to service_role;

commit;
