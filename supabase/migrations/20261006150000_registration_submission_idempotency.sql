alter table public.organization_registration_attempts
  add column if not exists ip_hash text;

create index if not exists organization_registration_attempts_ip_created_idx
  on public.organization_registration_attempts (ip_hash, created_at desc)
  where ip_hash is not null;

drop function if exists public.create_organization_registration(uuid, text, text);

create or replace function public.create_organization_registration(
  p_user_id uuid,
  p_name text,
  p_slug text,
  p_ip_hash text default null
)
returns table (organization_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_organization_id uuid;
  new_organization_id uuid;
  recent_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create organization registrations.';
  end if;
  if p_user_id is null or p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 120 then
    raise exception 'Enter an organization name between 1 and 120 characters.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 1));
  end if;

  select id into existing_organization_id
  from public.organizations
  where created_by = p_user_id
    and registration_status = 'pending'
  order by created_at desc
  limit 1;

  if existing_organization_id is not null then
    return query select existing_organization_id, false;
    return;
  end if;

  select count(*)::integer into recent_attempts
  from public.organization_registration_attempts
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if recent_attempts >= 3 then
    raise exception 'You have reached the workspace registration limit. Please try again later.';
  end if;

  if p_ip_hash is not null and (
    select count(*) from public.organization_registration_attempts
    where ip_hash = p_ip_hash
      and created_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Too many workspace registrations were submitted from this network. Please try again later.';
  end if;

  insert into public.organizations (name, slug, created_by, registration_status)
  values (btrim(p_name), p_slug, p_user_id, 'pending')
  returning id into new_organization_id;

  insert into public.organization_members (org_id, user_id, role, status)
  values (new_organization_id, p_user_id, 'owner', 'invited');

  insert into public.organization_registration_attempts (user_id, ip_hash)
  values (p_user_id, p_ip_hash);

  return query select new_organization_id, true;
end;
$$;

revoke all on function public.create_organization_registration(uuid, text, text, text) from public;
grant execute on function public.create_organization_registration(uuid, text, text, text) to service_role;
