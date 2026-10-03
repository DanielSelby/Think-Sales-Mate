update public.organization_members as member
set
  role = 'owner',
  location_id = null,
  branch_scope = 'all',
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
  and (
    organization.created_by = member.user_id
    or member.role = 'owner'
    or lower(coalesce(member.access_permissions ->> 'role_key', '')) in ('owner', 'super_admin')
  );
