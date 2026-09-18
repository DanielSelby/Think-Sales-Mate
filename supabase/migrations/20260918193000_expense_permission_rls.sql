-- Respect configured module/action permissions for expense creation.
drop policy if exists "expenses: managers can record" on public.expenses;

create policy "expenses: authorized members can record"
  on public.expenses for insert
  with check (
    recorded_by = auth.uid()
    and exists (
      select 1
      from public.organization_members member
      where member.org_id = expenses.org_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and (
          member.role in ('owner', 'admin', 'manager')
          or coalesce(member.access_permissions -> 'permissions' -> 'expenses', '[]'::jsonb)
             ? 'create'
        )
    )
  );
