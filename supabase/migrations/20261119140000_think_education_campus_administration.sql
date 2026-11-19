begin;

create or replace function public.education_update_campus(
  p_org_id uuid,
  p_branch_id uuid,
  p_name text,
  p_code text,
  p_address text,
  p_city text,
  p_region text,
  p_country text,
  p_phone text,
  p_email text,
  p_administrator_user_id uuid,
  p_status text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  campus_row public.education_campuses%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null
    or p_name is null or char_length(btrim(p_name)) not between 1 and 120
    or p_code is null or btrim(p_code) !~ '^[A-Za-z0-9-]{1,32}$'
    or (p_address is not null and char_length(btrim(p_address)) > 200)
    or (p_city is not null and char_length(btrim(p_city)) > 100)
    or (p_region is not null and char_length(btrim(p_region)) > 100)
    or (p_country is not null and char_length(btrim(p_country)) > 100)
    or (p_phone is not null and char_length(btrim(p_phone)) > 32)
    or (p_email is not null and (
      char_length(btrim(p_email)) > 254
      or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    or p_status is null or p_status not in ('active', 'inactive', 'archived') then
    raise exception 'Campus details are invalid.' using errcode = '22023';
  end if;

  select campus.* into campus_row
  from public.education_campuses campus
  where campus.org_id = p_org_id
    and campus.branch_id = p_branch_id
  for update;
  if not found then
    raise exception 'The campus was not found.' using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_organization', 'edit') then
    raise exception 'You cannot edit this Think Education campus.' using errcode = '42501';
  end if;

  if p_administrator_user_id is distinct from campus_row.administrator_user_id then
    if not public.has_org_product_permission(
      p_org_id, 'think-education', 'education_user_management', 'edit'
    ) then
      raise exception 'You need Think Education user-management permission to assign a campus administrator.'
        using errcode = '42501';
    end if;
    if p_administrator_user_id is not null and not exists (
      select 1
      from public.organization_members member
      where member.org_id = p_org_id
        and member.user_id = p_administrator_user_id
        and member.status = 'active'
        and (
          exists (
            select 1
            from public.education_member_branch_scopes scope
            where scope.org_id = p_org_id
              and scope.user_id = p_administrator_user_id
              and (
                scope.scope_type = 'organization'
                or (scope.scope_type = 'branch' and scope.branch_id = p_branch_id)
              )
          )
        )
    ) then
      raise exception 'Choose an active member who already has access to this campus.'
        using errcode = '22023';
    end if;
  end if;

  update public.business_locations
  set name = btrim(p_name),
      code = upper(btrim(p_code)),
      address = nullif(btrim(p_address), ''),
      city = nullif(btrim(p_city), ''),
      region = nullif(btrim(p_region), ''),
      country = nullif(btrim(p_country), ''),
      phone = nullif(btrim(p_phone), ''),
      email = nullif(btrim(p_email), '')
  where org_id = p_org_id
    and id = p_branch_id;
  if not found then
    raise exception 'The campus branch record was not found.' using errcode = 'P0002';
  end if;

  update public.education_campuses
  set administrator_user_id = p_administrator_user_id,
      status = p_status,
      updated_at = now()
  where org_id = p_org_id
    and branch_id = p_branch_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    'education_campus_updated',
    'education_campus',
    p_branch_id,
    jsonb_build_object(
      'name', btrim(p_name),
      'code', upper(btrim(p_code)),
      'status', p_status,
      'administrator_user_id', p_administrator_user_id
    )
  );
  return true;
end;
$$;

revoke all on function public.education_update_campus(uuid, uuid, text, text, text, text, text, text, text, text, uuid, text)
  from public, anon;
grant execute on function public.education_update_campus(uuid, uuid, text, text, text, text, text, text, text, text, uuid, text)
  to authenticated;

commit;
