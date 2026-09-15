-- Shared public assets managed by platform administrators.
insert into storage.buckets (id, name, public)
values ('platform-assets', 'platform-assets', true)
on conflict (id) do nothing;

create policy "platform-assets: public read"
  on storage.objects for select
  using (bucket_id = 'platform-assets');

create policy "platform-assets: platform admins can upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'platform-assets' and public.is_platform_admin());

create policy "platform-assets: platform admins can update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'platform-assets' and public.is_platform_admin())
  with check (bucket_id = 'platform-assets' and public.is_platform_admin());
