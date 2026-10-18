create table public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 100),
  messages jsonb not null check (
    jsonb_typeof(messages) = 'array'
    and jsonb_array_length(messages) between 1 and 100
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_chat_conversations_owner_updated_idx
  on public.ai_chat_conversations (org_id, user_id, updated_at desc);

alter table public.ai_chat_conversations enable row level security;
revoke all on public.ai_chat_conversations from public, anon;
grant select, insert, update, delete on public.ai_chat_conversations to authenticated;

create policy "ai chat conversations: users can read own organization history"
  on public.ai_chat_conversations for select
  using (user_id = auth.uid() and public.is_org_member(org_id));

create policy "ai chat conversations: users can create own organization history"
  on public.ai_chat_conversations for insert
  with check (user_id = auth.uid() and public.is_org_member(org_id));

create policy "ai chat conversations: users can update own organization history"
  on public.ai_chat_conversations for update
  using (user_id = auth.uid() and public.is_org_member(org_id))
  with check (user_id = auth.uid() and public.is_org_member(org_id));

create policy "ai chat conversations: users can delete own organization history"
  on public.ai_chat_conversations for delete
  using (user_id = auth.uid() and public.is_org_member(org_id));
