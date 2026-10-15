-- Role templates are authoritative unless a member has an explicit custom override.
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
     and template.role_key = case coalesce(member.access_permissions ->> 'role_key', member.role::text)
       when 'admin' then 'administrator'
       when 'branch_manager' then 'manager'
       when 'super_admin' then 'owner'
       else coalesce(member.access_permissions ->> 'role_key', member.role::text)
     end
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role = 'owner'
        or (
          case
          when member.access_permissions ->> 'permissions_mode' = 'custom' then
            coalesce(member.access_permissions -> 'permissions' -> target_module, '[]'::jsonb)
              ? target_action
          when template.org_id is not null then
            coalesce(template.permissions -> target_module, '[]'::jsonb) ? target_action
          else
            coalesce(member.access_permissions -> 'role_defaults_fallback' -> target_module, '[]'::jsonb)
              ? target_action
          end
        )
      )
  );
$$;

grant execute on function public.has_org_permission(uuid, text, text) to authenticated;

-- Preserve old role snapshots as compatibility defaults for RLS only. A saved
-- role template always takes precedence, and member overrides require an
-- explicit permissions_mode = 'custom' marker.
update public.organization_members
set access_permissions = jsonb_set(
  jsonb_set(
    coalesce(access_permissions, '{}'::jsonb),
    '{permissions_mode}',
    '"inherit"'::jsonb,
    true
  ),
  '{role_defaults_fallback}',
  coalesce(access_permissions -> 'role_defaults_fallback', access_permissions -> 'permissions', '{}'::jsonb),
  true
)
where coalesce(access_permissions ->> 'permissions_mode', '') = '';

-- Replace the older direct permission-json check so legacy role snapshots cannot
-- bypass the current role template in the bank-account selector.
drop policy if exists "bank_accounts: authorized members can read" on public.bank_accounts;
drop policy if exists "bank_accounts: members can read for expenses" on public.bank_accounts;

create policy "bank_accounts: authorized members can read"
  on public.bank_accounts for select
  using (
    public.has_org_permission(org_id, 'banking', 'view')
    or public.has_org_permission(org_id, 'expenses', 'create')
    or public.has_org_permission(org_id, 'expenses', 'edit')
    or exists (
      select 1
      from public.organization_members member
      where member.org_id = bank_accounts.org_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role::text in ('admin', 'manager')
    )
  );
