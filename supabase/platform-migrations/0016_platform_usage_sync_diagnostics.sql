create or replace function public.get_unmatched_platform_usage_organizations(
  p_organization_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unmatched_organization_ids uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can inspect unmatched usage organizations.';
  end if;
  if p_organization_ids is null or array_position(p_organization_ids, null) is not null then
    raise exception 'A valid organization ID array is required.';
  end if;

  select coalesce(array_agg(missing.organization_id order by missing.organization_id), '{}'::uuid[])
  into unmatched_organization_ids
  from (
    select distinct requested.organization_id
    from unnest(p_organization_ids) as requested(organization_id)
    where not exists (
      select 1
      from public.platform_organizations as organizations
      where organizations.organization_id = requested.organization_id
    )
  ) as missing;

  return unmatched_organization_ids;
end;
$$;

revoke all on function public.get_unmatched_platform_usage_organizations(uuid[]) from public, anon, authenticated;
grant execute on function public.get_unmatched_platform_usage_organizations(uuid[]) to service_role;
