create or replace function public.set_organization_product_role_permissions(
  p_org_id uuid,
  p_product_slug text,
  p_role_key text,
  p_name text,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_product_admin(p_org_id) then
    raise exception 'Only an organization owner or super administrator may manage product permissions.'
      using errcode = '42501';
  end if;
  if coalesce(p_product_slug, '') not in (
    'thinksales-erp', 'restaurant', 'think-service-repairs', 'think-education'
  ) or not public.has_product_access(p_org_id, p_product_slug, false) then
    raise exception 'This product is not available to the organization.'
      using errcode = '42501';
  end if;
  if coalesce(p_role_key, '') !~ '^[a-z0-9_]+$'
    or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'A valid role key and permission matrix are required.';
  end if;

  insert into public.organization_product_role_templates (
    org_id, product_slug, role_key, name, permissions, updated_by, updated_at
  ) values (
    p_org_id, p_product_slug, p_role_key, nullif(p_name, ''), p_permissions, auth.uid(), now()
  )
  on conflict (org_id, product_slug, role_key) do update
    set name = excluded.name,
        permissions = excluded.permissions,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.set_organization_member_product_role(
  p_org_id uuid,
  p_user_id uuid,
  p_product_slug text,
  p_role_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_product_admin(p_org_id) then
    raise exception 'Only an organization owner or super administrator may manage product permissions.'
      using errcode = '42501';
  end if;
  if coalesce(p_product_slug, '') not in (
    'thinksales-erp', 'restaurant', 'think-service-repairs', 'think-education'
  ) or not public.has_product_access(p_org_id, p_product_slug, false) then
    raise exception 'This product is not available to the organization.'
      using errcode = '42501';
  end if;
  if p_role_key in ('owner', 'super_admin') then
    raise exception 'Organization administrator roles cannot be assigned as product roles.';
  end if;
  if not exists (
    select 1
    from public.organization_product_access_assignments assignment
    join public.organization_members member
      on member.org_id = assignment.org_id
     and member.user_id = assignment.user_id
     and member.status = 'active'
    where assignment.org_id = p_org_id
      and assignment.user_id = p_user_id
      and assignment.product_slug = p_product_slug
      and assignment.is_active
  ) then
    raise exception 'Assign the member to this product before changing product permissions.';
  end if;
  if not exists (
    select 1 from public.organization_product_role_templates template
    where template.org_id = p_org_id
      and template.product_slug = p_product_slug
      and template.role_key = p_role_key
  ) then
    raise exception 'The selected product role does not exist.';
  end if;

  insert into public.organization_member_product_permissions (
    org_id, user_id, product_slug, role_key, permissions_mode, permissions, updated_by, updated_at
  ) values (
    p_org_id, p_user_id, p_product_slug, p_role_key, 'inherit', '{}'::jsonb, auth.uid(), now()
  )
  on conflict (org_id, user_id, product_slug) do update
    set role_key = excluded.role_key,
        permissions_mode = 'inherit',
        permissions = '{}'::jsonb,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_organization_product_role_permissions(uuid, text, text, text, jsonb)
  from public, anon;
grant execute on function public.set_organization_product_role_permissions(uuid, text, text, text, jsonb)
  to authenticated;
revoke all on function public.set_organization_member_product_role(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.set_organization_member_product_role(uuid, uuid, text, text)
  to authenticated;
