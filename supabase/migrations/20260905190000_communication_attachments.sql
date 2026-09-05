begin;

alter table public.communication_messages
  alter column body drop not null;

alter table public.communication_messages
  add column if not exists attachment_name text,
  add column if not exists attachment_path text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

alter table public.communication_messages
  drop constraint if exists communication_messages_body_check;

alter table public.communication_messages
  add constraint communication_messages_body_or_attachment_check
  check (nullif(trim(body), '') is not null or attachment_path is not null);

create index if not exists idx_communication_messages_attachment
  on public.communication_messages (attachment_path)
  where attachment_path is not null;

insert into storage.buckets (id, name, public)
values ('communication-files', 'communication-files', true)
on conflict (id) do update set public = true;

drop policy if exists "communication files: members can upload" on storage.objects;
create policy "communication files: members can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'communication-files'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "communication files: members can read" on storage.objects;
create policy "communication files: members can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'communication-files'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

commit;
