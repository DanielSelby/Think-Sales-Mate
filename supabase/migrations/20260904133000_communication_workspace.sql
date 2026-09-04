begin;

create table if not exists public.communication_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  channel_type text not null default 'Group' check (channel_type in ('Branch', 'Group', 'Direct', 'Announcement')),
  location_id uuid references public.business_locations (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.communication_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_communication_channels_org
  on public.communication_channels (org_id, archived, created_at desc);
create index if not exists idx_communication_messages_channel
  on public.communication_messages (channel_id, created_at);

alter table public.communication_channels enable row level security;
alter table public.communication_messages enable row level security;

drop policy if exists "communication channels: members can read" on public.communication_channels;
create policy "communication channels: members can read"
  on public.communication_channels for select
  using (public.is_org_member(org_id));

drop policy if exists "communication channels: members can create" on public.communication_channels;
create policy "communication channels: members can create"
  on public.communication_channels for insert
  with check (public.is_org_member(org_id) and created_by = auth.uid());

drop policy if exists "communication channels: members can update" on public.communication_channels;
create policy "communication channels: members can update"
  on public.communication_channels for update
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists "communication messages: members can read" on public.communication_messages;
create policy "communication messages: members can read"
  on public.communication_messages for select
  using (
    exists (
      select 1
      from public.communication_channels c
      where c.id = communication_messages.channel_id
        and public.is_org_member(c.org_id)
    )
  );

drop policy if exists "communication messages: members can create" on public.communication_messages;
create policy "communication messages: members can create"
  on public.communication_messages for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.communication_channels c
      where c.id = communication_messages.channel_id
        and public.is_org_member(c.org_id)
        and c.archived = false
    )
  );

drop policy if exists "communication messages: authors can update" on public.communication_messages;
create policy "communication messages: authors can update"
  on public.communication_messages for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
