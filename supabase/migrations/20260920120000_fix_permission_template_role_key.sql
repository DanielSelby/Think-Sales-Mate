-- Resolve permission templates using the member's configured role key.
-- Cashier and other custom UI roles are stored as a database-compatible
-- member role (usually staff) plus access_permissions.role_key.
create or replace function public.has_org_permission(
  target_org_id uuid,
  target_module text,
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members member
    left join public.organization_role_templates template
      on template.org_id = member.org_id
     and template.role_key = coalesce(member.access_permissions ->> 'role_key', member.role::text)
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role = 'owner'
        or coalesce(member.access_permissions -> 'permissions' -> target_module, '[]'::jsonb)
             ? target_action
        or coalesce(template.permissions -> target_module, '[]'::jsonb)
             ? target_action
      )
  );
$$;

grant execute on function public.has_org_permission(uuid, text, text) to authenticated;
