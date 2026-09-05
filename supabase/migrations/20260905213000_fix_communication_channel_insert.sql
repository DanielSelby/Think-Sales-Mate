create or replace function public.communication_org_member(
  p_org_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where org_id = p_org_id
      and user_id = p_user_id
      and status = 'active'
  );
$$;

drop policy if exists "communication channels: members can create" on public.communication_channels;
create policy "communication channels: members can create"
  on public.communication_channels for insert to authenticated
  with check (public.communication_org_member(org_id) and created_by = auth.uid());

drop policy if exists "communication channels: members can read" on public.communication_channels;
create policy "communication channels: members can read"
  on public.communication_channels for select to authenticated
  using (
    public.communication_org_member(org_id)
    and (channel_type <> 'Direct' or public.communication_channel_member(id))
  );
