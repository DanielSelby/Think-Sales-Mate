begin;

create table if not exists public.communication_channel_members (
  channel_id uuid not null references public.communication_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists idx_communication_channel_members_user
  on public.communication_channel_members (user_id, channel_id);

alter table public.communication_channel_members enable row level security;

drop policy if exists "communication channel members: org members can read" on public.communication_channel_members;
create policy "communication channel members: org members can read"
  on public.communication_channel_members for select to authenticated
  using (
    exists (
      select 1 from public.communication_channels c
      where c.id = communication_channel_members.channel_id
        and public.is_org_member(c.org_id)
    )
  );

drop policy if exists "communication channel members: org members can create" on public.communication_channel_members;
create policy "communication channel members: org members can create"
  on public.communication_channel_members for insert to authenticated
  with check (
    exists (
      select 1 from public.communication_channels c
      where c.id = communication_channel_members.channel_id
        and public.is_org_member(c.org_id)
    )
  );

drop policy if exists "communication channels: members can read" on public.communication_channels;
create policy "communication channels: members can read"
  on public.communication_channels for select
  using (
    public.is_org_member(org_id)
    and (
      channel_type <> 'Direct'
      or exists (
        select 1 from public.communication_channel_members cm
        where cm.channel_id = communication_channels.id
          and cm.user_id = auth.uid()
      )
    )
  );

drop policy if exists "communication messages: members can read" on public.communication_messages;
create policy "communication messages: members can read"
  on public.communication_messages for select
  using (
    exists (
      select 1 from public.communication_channels c
      where c.id = communication_messages.channel_id
        and public.is_org_member(c.org_id)
        and (
          c.channel_type <> 'Direct'
          or exists (
            select 1 from public.communication_channel_members cm
            where cm.channel_id = c.id
              and cm.user_id = auth.uid()
          )
        )
    )
  );

commit;
