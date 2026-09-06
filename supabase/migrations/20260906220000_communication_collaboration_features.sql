begin;

create table if not exists public.communication_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.communication_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (length(trim(reaction)) between 1 and 32),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, reaction)
);

create table if not exists public.communication_message_reads (
  message_id uuid not null references public.communication_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.communication_announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid references public.communication_channels(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  title text not null,
  body text not null,
  announcement_type text not null default 'Company Announcement',
  priority text not null default 'Normal' check (priority in ('Normal','Important','Critical')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_announcement_reads (
  announcement_id uuid not null references public.communication_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table if not exists public.communication_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid references public.communication_channels(id) on delete set null,
  started_by uuid not null references public.profiles(id),
  call_type text not null default 'voice' check (call_type in ('voice','video')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.communication_polls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.communication_channels(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  question text not null,
  options jsonb not null default '[]'::jsonb,
  allow_multiple boolean not null default false,
  anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_poll_votes (
  poll_id uuid not null references public.communication_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index integer not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option_index)
);

create table if not exists public.communication_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid references public.communication_channels(id) on delete set null,
  message_id uuid references public.communication_messages(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  title text not null,
  due_at timestamptz,
  priority text not null default 'Normal',
  status text not null default 'Open',
  created_at timestamptz not null default now()
);

create table if not exists public.communication_activity_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  channel_id uuid references public.communication_channels(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.communication_reactions enable row level security;
alter table public.communication_message_reads enable row level security;
alter table public.communication_announcements enable row level security;
alter table public.communication_announcement_reads enable row level security;
alter table public.communication_calls enable row level security;
alter table public.communication_polls enable row level security;
alter table public.communication_poll_votes enable row level security;
alter table public.communication_tasks enable row level security;
alter table public.communication_activity_logs enable row level security;

create policy "communication collaboration members" on public.communication_reactions for all
  using (exists (select 1 from public.communication_messages m join public.communication_channels c on c.id = m.channel_id where m.id = message_id and public.is_org_member(c.org_id)))
  with check (user_id = auth.uid() and exists (select 1 from public.communication_messages m join public.communication_channels c on c.id = m.channel_id where m.id = message_id and public.is_org_member(c.org_id)));
create policy "communication message reads members" on public.communication_message_reads for all
  using (user_id = auth.uid() or exists (select 1 from public.communication_messages m join public.communication_channels c on c.id = m.channel_id where m.id = message_id and public.is_org_member(c.org_id)))
  with check (user_id = auth.uid());
create policy "communication announcements members" on public.communication_announcements for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy "communication announcement reads members" on public.communication_announcement_reads for all
  using (user_id = auth.uid() or exists (select 1 from public.communication_announcements a where a.id = announcement_id and public.is_org_member(a.org_id)))
  with check (user_id = auth.uid());
create policy "communication calls members" on public.communication_calls for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id) and started_by = auth.uid());
create policy "communication polls members" on public.communication_polls for all
  using (exists (select 1 from public.communication_channels c where c.id = channel_id and public.is_org_member(c.org_id)))
  with check (created_by = auth.uid() and exists (select 1 from public.communication_channels c where c.id = channel_id and public.is_org_member(c.org_id)));
create policy "communication poll votes members" on public.communication_poll_votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "communication tasks members" on public.communication_tasks for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id) and created_by = auth.uid());
create policy "communication activity members" on public.communication_activity_logs for all
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id) and actor_id = auth.uid());

commit;
