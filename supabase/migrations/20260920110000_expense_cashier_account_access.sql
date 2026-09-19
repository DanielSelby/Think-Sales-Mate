drop policy if exists "bank_accounts: managers can read" on public.bank_accounts;
drop policy if exists "bank_accounts: authorized members can read" on public.bank_accounts;

create policy "bank_accounts: authorized members can read"
  on public.bank_accounts for select
  using (
    public.has_org_permission(org_id, 'banking', 'view')
    or public.has_org_permission(org_id, 'expenses', 'create')
    or public.has_org_permission(org_id, 'expenses', 'edit')
  );

drop policy if exists "bank_accounts: members can read for expenses" on public.bank_accounts;
create policy "bank_accounts: members can read for expenses"
  on public.bank_accounts for select
  using (
    public.is_org_member(org_id)
    and exists (
      select 1
      from public.organization_members member
      where member.org_id = bank_accounts.org_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and (
          member.role::text in ('owner', 'admin', 'manager')
          or coalesce(member.access_permissions -> 'permissions' -> 'expenses', '[]'::jsonb) ? 'create'
          or coalesce(member.access_permissions -> 'permissions' -> 'expenses', '[]'::jsonb) ? 'edit'
        )
    )
  );
