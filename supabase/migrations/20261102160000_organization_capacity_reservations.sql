create table if not exists public.organization_capacity_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource text not null check (resource in ('users', 'branches')),
  reserved_count integer not null check (reserved_count > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists organization_capacity_reservations_lookup_idx
  on public.organization_capacity_reservations (organization_id, resource, expires_at);

alter table public.organization_capacity_reservations enable row level security;
revoke all on table public.organization_capacity_reservations from public, anon, authenticated;
grant all on table public.organization_capacity_reservations to service_role;

create or replace function public.reserve_organization_capacity(
  p_organization_id uuid,
  p_resource text,
  p_limit integer,
  p_additional integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_usage integer;
  reserved_usage integer;
  reservation_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can reserve organization capacity.';
  end if;
  if p_organization_id is null
    or p_resource is null
    or p_resource not in ('users', 'branches')
    or p_additional is null
    or p_additional < 1
    or (p_limit is not null and p_limit < 0) then
    raise exception 'Organization capacity reservation parameters are invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_resource, 0));
  delete from public.organization_capacity_reservations
  where organization_id = p_organization_id
    and resource = p_resource
    and expires_at <= now();

  if p_resource = 'users' then
    select count(*)::integer into current_usage
    from public.organization_members
    where org_id = p_organization_id
      and status in ('active', 'invited');
  else
    select count(*)::integer into current_usage
    from public.business_locations
    where org_id = p_organization_id;
  end if;

  select coalesce(sum(reserved_count), 0)::integer into reserved_usage
  from public.organization_capacity_reservations
  where organization_id = p_organization_id
    and resource = p_resource
    and expires_at > now();

  if p_limit is not null and current_usage + reserved_usage + p_additional > p_limit then
    raise exception 'This organization has reached its % limit of %. Contact your Platform Admin to increase it.',
      p_resource, p_limit;
  end if;

  insert into public.organization_capacity_reservations (
    organization_id,
    resource,
    reserved_count,
    expires_at
  )
  values (
    p_organization_id,
    p_resource,
    p_additional,
    now() + interval '15 minutes'
  )
  returning id into reservation_id;

  return reservation_id;
end;
$$;

revoke all on function public.reserve_organization_capacity(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_organization_capacity(uuid, text, integer, integer) to service_role;

create or replace function public.release_organization_capacity(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can release organization capacity.';
  end if;

  delete from public.organization_capacity_reservations
  where id = p_reservation_id;
end;
$$;

revoke all on function public.release_organization_capacity(uuid) from public, anon, authenticated;
grant execute on function public.release_organization_capacity(uuid) to service_role;
