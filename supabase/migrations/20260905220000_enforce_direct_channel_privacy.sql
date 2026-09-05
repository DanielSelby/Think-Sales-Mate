drop policy if exists "communication channels: members can read" on public.communication_channels;
drop policy if exists "communication messages: members can read" on public.communication_messages;
drop function if exists public.communication_channel_member(uuid, uuid);

create function public.communication_channel_member(
  p_channel_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_channel_members
    where channel_id = p_channel_id
      and user_id = p_user_id
  );
$$;

create policy "communication channels: members can read"
  on public.communication_channels for select to authenticated
  using (
    public.communication_org_member(org_id)
    and (
      channel_type <> 'Direct'
      or public.communication_channel_member(id, auth.uid())
    )
  );

create policy "communication messages: members can read"
  on public.communication_messages for select to authenticated
  using (
    public.communication_channel_org_member(channel_id)
    and (
      not public.communication_channel_is_direct(channel_id)
      or public.communication_channel_member(channel_id, auth.uid())
    )
  );
