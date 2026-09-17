begin;

drop policy if exists "customer message campaigns members" on public.customer_message_campaigns;
create policy "customer message campaigns members" on public.customer_message_campaigns for select
  using (public.is_org_member(org_id));
create policy "customer message campaigns create" on public.customer_message_campaigns for insert
  with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy "customer message campaigns update" on public.customer_message_campaigns for update
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "customer message campaigns delete" on public.customer_message_campaigns for delete
  using (public.is_org_member(org_id));

commit;
