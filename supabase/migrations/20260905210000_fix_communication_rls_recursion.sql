-- Avoid circular RLS evaluation between channels and direct-channel members.
create or replace function public.communication_channel_org_member(
  p_channel_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_channels c
    join public.organization_members om
      on om.org_id = c.org_id
     and om.user_id = p_user_id
     and om.status = 'active'
    where c.id = p_channel_id
  );
$$;

create or replace function public.communication_channel_member(
  p_channel_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_channel_members cm
    where cm.channel_id = p_channel_id
      and cm.user_id = p_user_id
  );
$$;

create or replace function public.communication_channel_is_direct(p_channel_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.communication_channels
    where id = p_channel_id and channel_type = 'Direct'
  );
$$;

drop policy if exists "communication channel members: org members can read" on public.communication_channel_members;
create policy "communication channel members: org members can read"
  on public.communication_channel_members for select to authenticated
  using (public.communication_channel_org_member(channel_id));

drop policy if exists "communication channel members: org members can create" on public.communication_channel_members;
create policy "communication channel members: org members can create"
  on public.communication_channel_members for insert to authenticated
  with check (public.communication_channel_org_member(channel_id) and user_id is not null);

drop policy if exists "communication channels: members can read" on public.communication_channels;
create policy "communication channels: members can read"
  on public.communication_channels for select to authenticated
  using (
    public.is_org_member(org_id)
    and (
      channel_type <> 'Direct'
      or public.communication_channel_member(id)
    )
  );

drop policy if exists "communication messages: members can read" on public.communication_messages;
create policy "communication messages: members can read"
  on public.communication_messages for select to authenticated
  using (
    public.communication_channel_org_member(channel_id)
    and (not public.communication_channel_is_direct(channel_id)
      or public.communication_channel_member(channel_id))
  );

drop policy if exists "communication messages: members can create" on public.communication_messages;
create policy "communication messages: members can create"
  on public.communication_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.communication_channel_org_member(channel_id)
  );
