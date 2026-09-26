begin;

create policy "payroll_run_items: managers can update payment state"
  on public.payroll_run_items for update
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

commit;
