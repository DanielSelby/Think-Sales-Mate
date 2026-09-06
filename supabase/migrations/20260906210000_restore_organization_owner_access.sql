-- Restore the canonical owner role for workspace creators.
-- Older user-management saves could change the membership role while leaving
-- organizations.created_by unchanged, which made RLS and capability checks
-- incorrectly restrict the original owner.

update public.organization_members as member
set
  role = 'owner',
  status = 'active',
  branch_scope = 'all',
  location_id = null,
  secondary_location_ids = '{}',
  can_view_other_users_transactions = true,
  can_check_cross_branch_stock = true,
  access_permissions = jsonb_set(
    coalesce(member.access_permissions, '{}'::jsonb),
    '{role_key}',
    '"owner"'::jsonb,
    true
  )
from public.organizations as organization
where organization.id = member.org_id
  and organization.created_by = member.user_id;

-- Keep RLS aligned with the ownership source of truth even if a legacy row
-- is encountered before the normalization update above is applied.
create or replace function public.has_org_role(target_org_id uuid, min_role public.member_role)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members as member
    left join public.organizations as organization on organization.id = member.org_id
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        organization.created_by = auth.uid()
        or case min_role
          when 'viewer' then member.role in ('owner','admin','manager','staff','viewer')
          when 'staff' then member.role in ('owner','admin','manager','staff')
          when 'manager' then member.role in ('owner','admin','manager')
          when 'admin' then member.role in ('owner','admin')
          when 'owner' then member.role = 'owner'
        end
      )
  );
$$;
