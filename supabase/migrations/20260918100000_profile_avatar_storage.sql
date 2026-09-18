-- Shared profile avatar storage for organization users and employee-linked accounts.
-- Files are scoped by auth user id so a user can only replace their own avatar.
begin;

alter table public.employees add column if not exists avatar_url text;
alter table public.employees add column if not exists location_id uuid references public.business_locations(id) on delete set null;
create index if not exists employees_org_department_idx on public.employees (org_id, department);
create index if not exists employees_org_status_idx on public.employees (org_id, status);

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "profile avatars: authenticated users read" on storage.objects;
create policy "profile avatars: authenticated users read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'profile-avatars');

drop policy if exists "profile avatars: users upload own" on storage.objects;
create policy "profile avatars: users upload own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile avatars: users update own" on storage.objects;
create policy "profile avatars: users update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile avatars: users delete own" on storage.objects;
create policy "profile avatars: users delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
