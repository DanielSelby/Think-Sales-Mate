begin;

-- Communication access is branch-aware and direct channels are private. These
-- helpers are SECURITY DEFINER so policies never recurse through each other.
create or replace function public.communication_user_can_access_location(
  target_org_id uuid,
  target_user_id uuid,
  target_location_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.org_id
    where m.org_id = target_org_id
      and m.user_id = target_user_id
      and m.status = 'active'
      and (
        o.created_by = target_user_id
        or target_location_id is null
        or m.branch_scope = 'all'
        or m.location_id = target_location_id
        or target_location_id = any(m.secondary_location_ids)
      )
  );
$$;

create or replace function public.communication_channel_can_manage(target_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_channels c
    where c.id = target_channel_id
      and (
        c.created_by = auth.uid()
        or public.has_org_role(c.org_id, 'admin')
      )
  );
$$;

create or replace function public.communication_channel_visible(
  target_channel_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_channels c
    where c.id = target_channel_id
      and public.communication_user_can_access_location(c.org_id, target_user_id, c.location_id)
      and (
        c.channel_type not in ('Direct', 'Group')
        or not exists (
          select 1
          from public.communication_channel_members cm
          where cm.channel_id = c.id
        )
        or exists (
          select 1
          from public.communication_channel_members cm
          where cm.channel_id = c.id
            and cm.user_id = target_user_id
        )
      )
  );
$$;

-- Replace permissive legacy policies with policies that enforce the same
-- branch/direct rules for normal client queries and realtime delivery.
drop policy if exists "communication channels: members can read" on public.communication_channels;
drop policy if exists "communication channels: members can create" on public.communication_channels;
drop policy if exists "communication channels: members can update" on public.communication_channels;
drop policy if exists "branch scope: communication_channels" on public.communication_channels;

create policy "communication channels: branch members can read"
  on public.communication_channels for select to authenticated
  using (public.communication_channel_visible(id));

create policy "communication channels: members can create"
  on public.communication_channels for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.communication_user_can_access_location(org_id, auth.uid(), location_id)
  );

create policy "communication channels: owners can update"
  on public.communication_channels for update to authenticated
  using (public.communication_channel_can_manage(id))
  with check (public.communication_channel_can_manage(id));

-- Membership rows are private for direct channels and manageable only by a
-- team creator or organization administrator.
drop policy if exists "communication channel members: org members can read" on public.communication_channel_members;
drop policy if exists "communication channel members: org members can create" on public.communication_channel_members;

create policy "communication channel members: scoped members can read"
  on public.communication_channel_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.communication_channel_can_manage(channel_id)
    or exists (
      select 1 from public.communication_channels c
      where c.id = channel_id
        and c.channel_type not in ('Direct', 'Group')
        and public.communication_channel_visible(c.id)
    )
  );

create policy "communication channel members: managers can create"
  on public.communication_channel_members for insert to authenticated
  with check (
    public.communication_channel_can_manage(channel_id)
    and exists (
      select 1
      from public.communication_channels c
      where c.id = channel_id
        and public.communication_user_can_access_location(c.org_id, user_id, c.location_id)
    )
  );

create policy "communication channel members: managers can remove"
  on public.communication_channel_members for delete to authenticated
  using (public.communication_channel_can_manage(channel_id));

drop policy if exists "communication messages: members can read" on public.communication_messages;
drop policy if exists "communication messages: members can create" on public.communication_messages;

create policy "communication messages: visible channel members can read"
  on public.communication_messages for select to authenticated
  using (public.communication_channel_visible(channel_id));

create policy "communication messages: visible channel members can create"
  on public.communication_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.communication_channel_visible(channel_id)
    and exists (
      select 1 from public.communication_channels c
      where c.id = channel_id and c.archived = false
    )
  );

drop policy if exists "communication announcements members" on public.communication_announcements;
create policy "communication announcements scoped members"
  on public.communication_announcements for all
  using (
    public.is_org_member(org_id)
    and (channel_id is null or public.communication_channel_visible(channel_id))
  )
  with check (
    public.is_org_member(org_id)
    and created_by = auth.uid()
    and (channel_id is null or public.communication_channel_visible(channel_id))
  );

drop policy if exists "communication announcement reads members" on public.communication_announcement_reads;
create policy "communication announcement reads scoped members"
  on public.communication_announcement_reads for all
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.communication_announcements a
      where a.id = announcement_id
        and public.is_org_member(a.org_id)
        and (a.channel_id is null or public.communication_channel_visible(a.channel_id))
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.communication_announcements a
      where a.id = announcement_id
        and public.is_org_member(a.org_id)
        and (a.channel_id is null or public.communication_channel_visible(a.channel_id))
    )
  );

-- Related collaboration records inherit the message/channel visibility
-- instead of exposing direct-channel metadata to every organization member.
drop policy if exists "communication collaboration members" on public.communication_reactions;
create policy "communication collaboration scoped members"
  on public.communication_reactions for all
  using (exists (
    select 1 from public.communication_messages m
    where m.id = message_id and public.communication_channel_visible(m.channel_id)
  ))
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.communication_messages m
      where m.id = message_id and public.communication_channel_visible(m.channel_id)
    )
  );

drop policy if exists "communication message reads members" on public.communication_message_reads;
create policy "communication message reads scoped members"
  on public.communication_message_reads for all
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.communication_messages m
      where m.id = message_id and public.communication_channel_visible(m.channel_id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.communication_messages m
      where m.id = message_id and public.communication_channel_visible(m.channel_id)
    )
  );

drop policy if exists "communication calls members" on public.communication_calls;
create policy "communication calls scoped members"
  on public.communication_calls for all
  using (
    public.is_org_member(org_id)
    and (channel_id is null or public.communication_channel_visible(channel_id))
  )
  with check (
    public.is_org_member(org_id)
    and started_by = auth.uid()
    and (channel_id is null or public.communication_channel_visible(channel_id))
  );

drop policy if exists "communication polls members" on public.communication_polls;
create policy "communication polls scoped members"
  on public.communication_polls for all
  using (public.communication_channel_visible(channel_id))
  with check (created_by = auth.uid() and public.communication_channel_visible(channel_id));

drop policy if exists "communication poll votes members" on public.communication_poll_votes;
create policy "communication poll votes scoped members"
  on public.communication_poll_votes for all
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.communication_polls p
      where p.id = poll_id and public.communication_channel_visible(p.channel_id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.communication_polls p
      where p.id = poll_id and public.communication_channel_visible(p.channel_id)
    )
  );

drop policy if exists "communication tasks members" on public.communication_tasks;
create policy "communication tasks scoped members"
  on public.communication_tasks for all
  using (
    public.is_org_member(org_id)
    and (channel_id is null or public.communication_channel_visible(channel_id))
  )
  with check (
    public.is_org_member(org_id)
    and created_by = auth.uid()
    and (channel_id is null or public.communication_channel_visible(channel_id))
  );

drop policy if exists "communication activity members" on public.communication_activity_logs;
create policy "communication activity scoped members"
  on public.communication_activity_logs for all
  using (
    public.is_org_member(org_id)
    and (channel_id is null or public.communication_channel_visible(channel_id))
  )
  with check (
    public.is_org_member(org_id)
    and actor_id = auth.uid()
    and (channel_id is null or public.communication_channel_visible(channel_id))
  );

-- Attachments use the existing org/channel/user path convention and must not
-- be publicly readable, otherwise direct-channel privacy is bypassed.
update storage.buckets
set public = false
where id = 'communication-files';

drop policy if exists "communication files: members can upload" on storage.objects;
create policy "communication files: scoped members can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'communication-files'
    and (storage.foldername(name))[1]::uuid in (
      select m.org_id from public.organization_members m
      where m.user_id = auth.uid() and m.status = 'active'
    )
    and exists (
      select 1
      from public.communication_channels c
      where c.id = (storage.foldername(name))[2]::uuid
        and c.org_id = (storage.foldername(name))[1]::uuid
        and public.communication_channel_visible(c.id)
    )
    and (storage.foldername(name))[3]::uuid = auth.uid()
  );

drop policy if exists "communication files: members can read" on storage.objects;
create policy "communication files: scoped members can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'communication-files'
    and exists (
      select 1
      from public.communication_channels c
      where c.id = (storage.foldername(name))[2]::uuid
        and c.org_id = (storage.foldername(name))[1]::uuid
        and public.communication_channel_visible(c.id)
    )
  );

-- The migration may be applied to projects where the publication already has
-- the table, so duplicate_object is intentionally ignored.
do $$
begin
  alter publication supabase_realtime add table public.communication_messages;
exception
  when duplicate_object then null;
end
$$;

-- Direct channels must carry a branch context. Existing group/branch channels
-- retain their existing location values.
create or replace function public.create_communication_channel(
  p_org_id uuid,
  p_name text,
  p_channel_type text,
  p_location_id uuid default null
)
returns setof public.communication_channels
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.communication_user_can_access_location(p_org_id, auth.uid(), p_location_id) then
    raise exception 'You do not have access to this branch';
  end if;
  if p_channel_type = 'Direct' and p_location_id is null then
    raise exception 'Select a branch before starting a direct chat';
  end if;
  if p_channel_type not in ('Branch', 'Group', 'Direct', 'Announcement') then
    raise exception 'Invalid communication channel type';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Channel name is required';
  end if;

  return query
    insert into public.communication_channels (
      org_id, name, channel_type, location_id, created_by
    )
    values (p_org_id, trim(p_name), p_channel_type, p_location_id, auth.uid())
    returning *;
end;
$$;

revoke all on function public.create_communication_channel(uuid, text, text, uuid) from public;
grant execute on function public.create_communication_channel(uuid, text, text, uuid) to authenticated;

commit;
