begin;

create table if not exists public.education_teacher_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists education_teacher_ai_usage_user_created_idx
  on public.education_teacher_ai_usage_events (org_id, user_id, created_at desc);
alter table public.education_teacher_ai_usage_events enable row level security;
revoke all on public.education_teacher_ai_usage_events from public, anon, authenticated;
grant all on public.education_teacher_ai_usage_events to service_role;

create or replace function public.education_reserve_teacher_ai_request(
  p_org_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent_minute_count integer;
  recent_day_count integer;
begin
  if p_org_id is null or p_user_id is null
    or not exists (
      select 1
      from public.education_staff staff
      join public.organizations organization
        on organization.id = staff.org_id
        and organization.registration_status = 'approved'
      where staff.org_id = p_org_id
        and staff.user_id = p_user_id
        and staff.staff_category = 'teaching'
        and staff.status = 'active'
        and public.has_product_access(staff.org_id, 'think-education', false)
    ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_user_id::text, 0));
  delete from public.education_teacher_ai_usage_events
  where org_id = p_org_id
    and user_id = p_user_id
    and created_at < now() - interval '1 day';

  select
    count(*) filter (where created_at >= now() - interval '1 minute'),
    count(*)
  into recent_minute_count, recent_day_count
  from public.education_teacher_ai_usage_events
  where org_id = p_org_id and user_id = p_user_id;

  if recent_minute_count >= 8 or recent_day_count >= 100 then
    return false;
  end if;

  insert into public.education_teacher_ai_usage_events (org_id, user_id)
  values (p_org_id, p_user_id);
  return true;
end;
$$;

revoke all on function public.education_reserve_teacher_ai_request(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.education_reserve_teacher_ai_request(uuid, uuid)
  to service_role;

commit;
