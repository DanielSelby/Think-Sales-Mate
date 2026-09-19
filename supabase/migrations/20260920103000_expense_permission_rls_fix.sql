drop policy if exists "expenses: managers can record" on public.expenses;
drop policy if exists "expenses: authorized members can record" on public.expenses;
drop policy if exists "expenses: managers can update" on public.expenses;
drop policy if exists "expenses: authorized members can update" on public.expenses;

create policy "expenses: authorized members can record"
  on public.expenses for insert
  with check (
    recorded_by = auth.uid()
    and public.has_org_permission(org_id, 'expenses', 'create')
  );

create policy "expenses: authorized members can update"
  on public.expenses for update
  using (public.has_org_permission(org_id, 'expenses', 'edit'))
  with check (public.has_org_permission(org_id, 'expenses', 'edit'));
